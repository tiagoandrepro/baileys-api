import { getSession, getChatList, isExists, sendMessage, formatGroup, inviteCode, getGroupsWithParticipants, leave, participantsUpdate } from './../whatsapp.js'
import response from './../response.js'

/*const getList = (req, res) => {
    return response(res, 200, true, '', getChatList(res.locals.sessionId, true))
}*/


const getList = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const groups = await getGroupsWithParticipants(session)
    return response(res, 200, true, '', groups)
}



const getGroupMetaData = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { jid } = req.params

    try {
        const data = await session.groupMetadata(jid)

        if (!data.id) {
            return response(res, 400, false, 'The group is not exists.')
        }

        response(res, 200, true, '', data)
    } catch {
        response(res, 500, false, 'Failed to get group metadata.')
    }
}

const send = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const receiver = formatGroup(req.body.receiver)
    const { message } = req.body

    try {
        const exists = await isExists(session, receiver, true)

        if (!exists) {
            return response(res, 400, false, 'The group is not exists.')
        }

        await sendMessage(session, receiver, message)

        response(res, 200, true, 'The message has been successfully sent.')
    } catch {
        response(res, 500, false, 'Failed to send the message.')
    }
}

const groupInviteCode = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { jid } = req.params
    try {
        const exists = await isExists(session, jid, true)

        if (!exists) {
            return response(res, 400, false, 'The group is not exists.')
        }

        const group = await inviteCode(session, jid)

        response(res, 200, true, 'Invite code successfully.', group)

    } catch {
        response(res, 500, false, 'Failed invite code.')
    }
}


const groupLeave = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const { jid } = req.params

    try {
        const exists = await isExists(session, jid, true)

        if (!exists) {
            return response(res, 400, false, 'The group is not exists.')
        }

        await leave(session, jid)

        response(res, 200, true, 'Leave group successfully.')

    } catch {
        response(res, 500, false, 'Failed leave group.')
    }
}


const groupParticipantsUpdate = async (req, res) => {
    const session = getSession(res.locals.sessionId)
  //  console.log(res.locals.sessionId)
    try {
        const exists = await isExists(session, req.body.groupId)
        console.log(req.body.groupId)



        await participantsUpdate(session, req.body)

        response(res, 200, true, 'Update participants successfully.')

    } catch {
        response(res, 500, false, 'Failed update participants.')
    }
}


export { getList, getGroupMetaData, send, groupInviteCode, groupLeave, groupParticipantsUpdate }
