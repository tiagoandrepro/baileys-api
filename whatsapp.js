// sessions.js — v7-ready
import { rmSync, readdir, existsSync } from 'fs'
import { join } from 'path'
import pino from 'pino'
import makeWASocket, {
  useMultiFileAuthState,
  makeInMemoryStore,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  delay,
  downloadMediaMessage,
  getAggregateVotesInPollMessage,
  fetchLatestBaileysVersion,
  WAMessageStatus,
  jidNormalizedUser,
  isPnUser,
  proto // <- v7: import nomeado
} from '@whiskeysockets/baileys'
import { toDataURL } from 'qrcode'
import __dirname from './dirname.js'
import response from './response.js'
import { downloadImage } from './utils/download.js'
import axios from 'axios'
import NodeCache from 'node-cache'

const msgRetryCounterCache = new NodeCache()
const sessions = new Map()
const retries = new Map()
const lidMap = new Map() // lid -> pn

const APP_WEBHOOK_ALLOWED_EVENTS = process.env.APP_WEBHOOK_ALLOWED_EVENTS.split(',')

const sessionsDir = (sessionId = '') => join(__dirname, 'sessions', sessionId || '')

const isSessionExists = (sessionId) => sessions.has(sessionId)
const isSessionConnected = (sid) => sessions.get(sid)?.ws?.socket?.readyState === 1

const shouldReconnect = (sid) => {
  const maxRetries = parseInt(process.env.MAX_RETRIES ?? 0)
  let attempts = retries.get(sid) ?? 0
  if (attempts < maxRetries || maxRetries === -1) {
    retries.set(sid, ++attempts)
    console.log('Reconnecting...', { attempts, sid })
    return true
  }
  return false
}

const callWebhook = async (instance, eventType, eventData) => {
  if (APP_WEBHOOK_ALLOWED_EVENTS.includes('ALL') || APP_WEBHOOK_ALLOWED_EVENTS.includes(eventType)) {
    await webhook(instance, eventType, eventData)
  }
}

const webhook = async (instance, type, data) => {
  if (!process.env.APP_WEBHOOK_URL) return
  try {
    await axios.post(`${process.env.APP_WEBHOOK_URL}`, { instance, type, data })
  } catch {}
}

const resolveCanonicalJid = (key) => {
  // v7: use alt quando existir; normaliza para usuário
  const alt = key?.remoteJidAlt || key?.participantAlt
  const base = alt || key?.remoteJid
  return base ? jidNormalizedUser(base) : undefined
}

const normalizeParticipants = (arr = []) => arr.map(jidNormalizedUser)

const createSession = async (sessionId, res = null, options = { usePairingCode: false, phoneNumber: '' }) => {
  const sessionFile = 'md_' + sessionId
  const logger = pino({ level: 'info' })
  const store = makeInMemoryStore({ logger })
  const { state, saveCreds } = await useMultiFileAuthState(sessionsDir(sessionFile))

  const { version, isLatest } = await fetchLatestBaileysVersion()
  console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

  // store
  store.readFromFile(sessionsDir(`${sessionId}_store.json`))
  setInterval(() => {
    if (existsSync(sessionsDir(sessionFile))) store.writeToFile(sessionsDir(`${sessionId}_store.json`))
  }, 10000)

  const wa = makeWASocket({
    version,
    printQRInTerminal: true,
    syncFullHistory: false,
    mobile: false,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    msgRetryCounterCache,
    generateHighQualityLinkPreview: true,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    getMessage
  })
  store.bind(wa.ev)
  sessions.set(sessionId, { ...wa, store })

  // Pairing code flow
  if (options.usePairingCode && !wa.authState.creds.registered) {
    if (!wa.authState.creds.account) {
      await wa.waitForConnectionUpdate((u) => Boolean(u.qr))
      const code = await wa.requestPairingCode(options.phoneNumber)
      if (res && !res.headersSent && code !== undefined) response(res, 200, true, 'Verify on your phone and enter the provided code.', { code })
      else response(res, 500, false, 'Unable to create session.')
    }
  }

  wa.ev.on('creds.update', saveCreds)

  // v7: atualizações de LID↔PN
  wa.ev.on('lid-mapping.update', ({ mappings = [] }) => {
    for (const m of mappings) {
      if (m?.lid && m?.pn) lidMap.set(jidNormalizedUser(m.lid), jidNormalizedUser(m.pn))
    }
    callWebhook(sessionId, 'LID_MAPPING_UPDATE', { size: mappings.length })
  })

  // Chats
  wa.ev.on('chats.set', ({ chats }) => callWebhook(sessionId, 'CHATS_SET', chats))
  wa.ev.on('chats.upsert', (c) => callWebhook(sessionId, 'CHATS_UPSERT', c))
  wa.ev.on('chats.delete', (c) => callWebhook(sessionId, 'CHATS_DELETE', c))
  wa.ev.on('chats.update', (c) => callWebhook(sessionId, 'CHATS_UPDATE', c))
  wa.ev.on('labels.association', (l) => callWebhook(sessionId, 'LABELS_ASSOCIATION', l))
  wa.ev.on('labels.edit', (l) => callWebhook(sessionId, 'LABELS_EDIT', l))

  // Messages
  wa.ev.on('messages.upsert', async ({ messages, type }) => {
    const inbound = messages.filter((m) => m.key.fromMe === false)
    if (!inbound.length) return

    const enriched = await Promise.all(
      inbound.map(async (msg) => {
        try {
          const from = resolveCanonicalJid(msg.key) // v7
          const kind = Object.keys(msg.message || {})[0]
          if (msg?.status) msg.status = WAMessageStatus[msg.status] ?? 'UNKNOWN'

          // opcional: embed base64
          if (['documentMessage', 'imageMessage', 'videoMessage', 'audioMessage'].includes(kind) && process.env.APP_WEBHOOK_FILE_IN_BASE64 === 'true') {
            const media = await getMessageMedia(wa, msg)
            const fields = ['fileEncSha256','mediaKey','fileSha256','jpegThumbnail','thumbnailSha256','thumbnailEncSha256','streamingSidecar']
            for (const f of fields) if (msg.message[kind]?.[f] !== undefined) msg.message[kind][f] = convertToBase64(msg.message[kind][f])
            return { ...msg, key: { ...msg.key, remoteJid: from }, message: { [kind]: { ...msg.message[kind], fileBase64: media.base64 } } }
          }
          return { ...msg, key: { ...msg.key, remoteJid: from } }
        } catch {
          return {}
        }
      })
    )

    callWebhook(sessionId, 'MESSAGES_UPSERT', enriched)
  })

  wa.ev.on('messages.delete', (m) => callWebhook(sessionId, 'MESSAGES_DELETE', m))

  wa.ev.on('messages.update', async (batch) => {
    for (const { key, update } of batch) {
      const msg = await getMessage(key)
      if (!msg) continue
      if (update?.status) update.status = WAMessageStatus[update.status]
      const canonicalKey = { ...key, remoteJid: resolveCanonicalJid(key) }
      callWebhook(sessionId, 'MESSAGES_UPDATE', [{ key: canonicalKey, update, message: msg }])
    }
  })

  wa.ev.on('message-receipt.update', async (batch) => {
    for (const { key, messageTimestamp, pushName, broadcast, update } of batch) {
      if (update?.pollUpdates) {
        const pollCreation = await getMessage(key)
        if (pollCreation) {
          const pollMessage = await getAggregateVotesInPollMessage({ message: pollCreation, pollUpdates: update.pollUpdates })
          update.pollUpdates[0].vote = pollMessage
          callWebhook(sessionId, 'MESSAGES_RECEIPT_UPDATE', [{ key, messageTimestamp, pushName, broadcast, update }])
          return
        }
      }
    }
    callWebhook(sessionId, 'MESSAGES_RECEIPT_UPDATE', batch)
  })

  wa.ev.on('messages.reaction', (m) => callWebhook(sessionId, 'MESSAGES_REACTION', m))
  wa.ev.on('messages.media-update', (m) => callWebhook(sessionId, 'MESSAGES_MEDIA_UPDATE', m))
  wa.ev.on('messaging-history.set', (m) => callWebhook(sessionId, 'MESSAGING_HISTORY_SET', m))

  // Connection
  wa.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update
    const statusCode = lastDisconnect?.error?.output?.statusCode
    callWebhook(sessionId, 'CONNECTION_UPDATE', update)

    if (connection === 'open') retries.delete(sessionId)

    if (connection === 'close') {
      if (statusCode === DisconnectReason.loggedOut || !shouldReconnect(sessionId)) {
        if (res && !res.headersSent) response(res, 500, false, 'Unable to create session.')
        return deleteSession(sessionId)
      }
      setTimeout(() => createSession(sessionId, res), statusCode === DisconnectReason.restartRequired ? 0 : parseInt(process.env.RECONNECT_INTERVAL ?? 0))
    }

    if (update.qr && res && !res.headersSent) {
      callWebhook(sessionId, 'QRCODE_UPDATED', update)
      try {
        const qr = await toDataURL(update.qr)
        // v7: não deslogue ao gerar QR
        response(res, 200, true, 'QR code received, please scan the QR code.', { qr })
      } catch {
        response(res, 500, false, 'Unable to create QR code.')
      }
    }
  })

  // Groups
  wa.ev.on('groups.upsert', (m) => callWebhook(sessionId, 'GROUPS_UPSERT', m))
  wa.ev.on('groups.update', (m) => callWebhook(sessionId, 'GROUPS_UPDATE', m))
  wa.ev.on('group-participants.update', (ev) => {
    const participants = normalizeParticipants(ev.participants)
    callWebhook(sessionId, 'GROUP_PARTICIPANTS_UPDATE', { ...ev, id: jidNormalizedUser(ev.id), participants })
  })

  wa.ev.on('blocklist.set', (m) => callWebhook(sessionId, 'BLOCKLIST_SET', m))
  wa.ev.on('blocklist.update', (m) => callWebhook(sessionId, 'BLOCKLIST_UPDATE', m))
  wa.ev.on('contacts.set', (c) => callWebhook(sessionId, 'CONTACTS_SET', c))
  wa.ev.on('contacts.upsert', (c) => callWebhook(sessionId, 'CONTACTS_UPSERT', c))
  wa.ev.on('contacts.update', (c) => callWebhook(sessionId, 'CONTACTS_UPDATE', c))
  wa.ev.on('presence.update', (p) => callWebhook(sessionId, 'PRESENCE_UPDATE', p))

  async function getMessage(key) {
    if (store) {
      const jid = resolveCanonicalJid(key) || key.remoteJid
      const msg = await store.loadMessage(jid, key.id)
      return msg?.message || undefined
    }
    return proto.Message.create() // v7: create()
  }
}

// Session helpers
const getSession = (sid) => sessions.get(sid) ?? null
const getListSessions = () => [...sessions.keys()]

const deleteSession = (sid) => {
  const sessionFile = 'md_' + sid
  const storeFile = `${sid}_store.json`
  const rmOptions = { force: true, recursive: true }
  rmSync(sessionsDir(sessionFile), rmOptions)
  rmSync(sessionsDir(storeFile), rmOptions)
  sessions.delete(sid); retries.delete(sid)
}

const getChatList = (sid, isGroup = false) => {
  const filter = isGroup ? '@g.us' : '@s.whatsapp.net'
  return getSession(sid).store.chats.filter((c) => c.id.endsWith(filter))
}

// API utilities
const isExists = async (session, jid, isGroup = false) => {
  try {
    if (isGroup) return Boolean((await session.groupMetadata(jid))?.id)
    const [result] = await session.onWhatsApp(jid)
    return result
  } catch { return false }
}

const sendMessage = async (session, receiver, message, delayMs = 1000) => {
  try {
    await delay(parseInt(delayMs))
    // v7: aceitar PN ou LID; normalize quando possível
    const to = isPnUser(receiver) ? jidNormalizedUser(receiver) : (lidMap.get(receiver) || receiver)
    return await session.sendMessage(to, message)
  } catch { return Promise.reject(null) }
}

const updateProfileStatus = async (s, status) => { try { return await s.updateProfileStatus(status) } catch { return Promise.reject(null) } }
const updateProfileName = async (s, name) => { try { return await s.updateProfileName(name) } catch { return Promise.reject(null) } }
const getProfilePicture = async (s, jid, type='image') => { try { return await s.profilePictureUrl(jid, type) } catch { return Promise.reject(null) } }
const blockAndUnblockUser = async (s, jid, block) => { try { return await s.updateBlockStatus(jid, block) } catch { return Promise.reject(null) } }

const formatPhone = (phone) => phone.endsWith('@s.whatsapp.net') ? phone : phone.replace(/\D/g, '') + '@s.whatsapp.net'
const formatGroup = (group) => group.endsWith('@g.us') ? group : group.replace(/[^\d-]/g, '') + '@g.us'

const cleanup = () => {
  console.log('Running cleanup before exit.')
  sessions.forEach((session, sid) => session.store.writeToFile(sessionsDir(`${sid}_store.json`)))
}

const getGroupsWithParticipants = async (s) => s.groupFetchAllParticipating()
const participantsUpdate = async (s, jid, participants, action) => s.groupParticipantsUpdate(jid, participants, action)
const updateSubject = async (s, jid, subject) => s.groupUpdateSubject(jid, subject)
const updateDescription = async (s, jid, description) => s.groupUpdateDescription(jid, description)
const settingUpdate = async (s, jid, settings) => s.groupSettingUpdate(jid, settings)
const leave = async (s, jid) => s.groupLeave(jid)
const inviteCode = async (s, jid) => s.groupInviteCode(jid)
const revokeInvite = async (s, jid) => s.groupRevokeInvite(jid)
const metaData = async (s, req) => s.groupMetadata(req.groupId)
const acceptInvite = async (s, req) => s.groupAcceptInvite(req.invite)
const profilePicture = async (s, jid, urlImage) => { const image = await downloadImage(urlImage); return s.updateProfilePicture(jid, { url: image }) }
const readMessage = async (s, keys) => s.readMessages(keys)

const getStoreMessage = async (s, messageId, remoteJid) => {
  try { return await s.store.loadMessage(remoteJid, messageId) }
  catch { return Promise.reject(null) }
}

const getMessageMedia = async (s, message) => {
  try {
    const messageType = Object.keys(message.message)[0]
    const mediaMessage = message.message[messageType]
    const buffer = await downloadMediaMessage(message, 'buffer', {}, { reuploadRequest: s.updateMediaMessage })
    return {
      messageType,
      fileName: mediaMessage.fileName ?? '',
      caption: mediaMessage.caption ?? '',
      size: { fileLength: mediaMessage.fileLength, height: mediaMessage.height ?? 0, width: mediaMessage.width ?? 0 },
      mimetype: mediaMessage.mimetype,
      base64: buffer.toString('base64')
    }
  } catch { return Promise.reject(null) }
}

const convertToBase64 = (bytes) => Buffer.from(new Uint8Array(bytes)).toString('base64')

const init = () => {
  readdir(sessionsDir(), (err, files) => {
    if (err) throw err
    for (const file of files) {
      if ((!file.startsWith('md_') && !file.startsWith('legacy_')) || file.endsWith('_store')) continue
      const filename = file.replace('.json', '')
      const sid = filename.substring(3)
      console.log('Recovering session: ' + sid)
      createSession(sid)
    }
  })
}

export {
  isSessionExists,
  createSession,
  getSession,
  getListSessions,
  deleteSession,
  getChatList,
  getGroupsWithParticipants,
  isExists,
  sendMessage,
  updateProfileStatus,
  updateProfileName,
  getProfilePicture,
  formatPhone,
  formatGroup,
  cleanup,
  participantsUpdate,
  updateSubject,
  updateDescription,
  settingUpdate,
  leave,
  inviteCode,
  revokeInvite,
  metaData,
  acceptInvite,
  profilePicture,
  readMessage,
  init,
  isSessionConnected,
  getMessageMedia,
  getStoreMessage,
  blockAndUnblockUser
}
