import { updateProfileStatus, getSession } from './../whatsapp.js'
import response from './../response.js'


const setProfileStatus = async (req, res) => {
    try {
        const session = getSession(res.locals.sessionId)
        await updateProfileStatus(session, req.body.status)
        response(res, 200, true, 'The status has been updated successfully')
    } catch {
        response(res, 500, false, 'Failed to update status')
    }
}




export { setProfileStatus }