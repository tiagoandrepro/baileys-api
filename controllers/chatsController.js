import { getSession, getChatList, isExists, sendMessage, formatPhone, formatGroup, readMessage } from './../whatsapp.js'
import response from './../response.js'

const getList = (req, res) => {
    return response(res, 200, true, '', getChatList(res.locals.sessionId))
}

const send = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { message } = req.body
    const isGroup = req.body.isGroup ?? false
    const receiver = (isGroup) ? formatGroup(req.body.receiver) : formatPhone(req.body.receiver)

    try {
        const exists = await isExists(session, receiver, isGroup)

        if (!exists) {
            return response(res, 400, false, 'The receiver number is not exists.')
        }

        await sendMessage(session, receiver, message, 0)

        response(res, 200, true, 'The message has been successfully sent.')
    } catch {
        response(res, 500, false, 'Failed to send the message.')
    }
}

const sendBulk = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const errors = []

    for (const [key, data] of req.body.entries()) {
        let { receiver, message, delay } = data

        if (!receiver || !message) {
            errors.push(key)

            continue
        }

        if (!delay || isNaN(delay)) {
            delay = 1000
        }

        receiver = formatPhone(receiver)

        try {
            const exists = await isExists(session, receiver)

            if (!exists) {
                errors.push(key)

                continue
            }

            await sendMessage(session, receiver, message, delay)
        } catch {
            errors.push(key)
        }
    }

    if (errors.length === 0) {
        return response(res, 200, true, 'All messages has been successfully sent.')
    }

    const isAllFailed = errors.length === req.body.length

    response(
        res,
        isAllFailed ? 500 : 200,
        !isAllFailed,
        isAllFailed ? 'Failed to send all messages.' : 'Some messages has been successfully sent.',
        { errors }
    )
}

const deleteChat = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { receiver, isGroup, message } = req.body

    try {
        let jidFormat = (isGroup) ? formatGroup(receiver) : formatPhone(receiver)

        await sendMessage(session, jidFormat, { delete: message })
        response(res, 200, true, 'Message has been successfully deleted.')
    } catch {
        response(res, 500, false, 'Failed to delete message .')
    }
}

const forward = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { forward, receiver, isGroup } = req.body

    const { id, remoteJid } = forward
    let jidFormat = (isGroup) ? formatGroup(receiver) : formatPhone(receiver)

    try {

        let messages
        if (session.isLegacy) {
            messages = await session.fetchMessagesFromWA(remoteJid, 25, null)
        } else {
            messages = await session.store.loadMessages(remoteJid, 25, null)
        }

        let key = messages.filter(element => {
            return element.key.id === id
        });

        let query_forward = {
            forward: key[0]
        }

        await sendMessage(session, jidFormat, query_forward, 0)

        response(res, 200, true, 'The message has been successfully forwarded.')
    } catch {
        response(res, 500, false, 'Failed to forward the message.')
    }
}

const read = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { keys } = req.body

    try {
        await readMessage(session, keys)

        if (!keys[0].id) throw new Error('Data not found')

        response(res, 200, true, 'The message has been successfully marked as read.')
    } catch {
        response(res, 500, false, 'Failed to mark the message as read.')
    }
}

const sendPresence = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { receiver, isGroup, presence } = req.body

    try {
        let jidFormat = (isGroup) ? formatGroup(receiver) : formatPhone(receiver)

        await session.sendPresenceUpdate(presence, jidFormat)

        response(res, 200, true, 'Presence has been successfully sent.')
    } catch {
        response(res, 500, false, 'Failed to send presence.')
    }
}

export { getList, send, sendBulk, deleteChat, read, forward, sendPresence }
