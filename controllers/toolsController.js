import { getSession, formatPhone, isExists } from './../whatsapp.js'
import response from './../response.js'


const checkMobilePhone = async (req, res) => {
    try {
        const session = getSession(res.locals.sessionId)
        const jid = formatPhone(req.body.mobile)

        const test = await isExists(session, jid)
        console.log(test)
        response(res, 200, true, '', test)
    } catch {
        response(res, 500, false, '')
    }
}

export { checkMobilePhone }
