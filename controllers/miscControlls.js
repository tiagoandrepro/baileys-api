import { updateProfileStatus, updateProfileName, getSession } from './../whatsapp.js'
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

const setProfileName = async (req, res) => {
    try {
        const session = getSession(res.locals.sessionId)
        await updateProfileName(session, req.body.name)
        response(res, 200, true, 'The name has been updated successfully')
    } catch {
        response(res, 500, false, 'Failed to update name')
    }
}

const getProfile = async (req, res) => {
    try {
        const session = getSession(res.locals.sessionId)

        session.user.phone = session.user.id.split(":")[0].split("@")[0];
        session.user.image = await session.profilePictureUrl(session.user.id,'image');
        session.user.status =  await session.fetchStatus(session.user.phone + "@s.whatsapp.net");

        response(res, 200, true, 'The information has been obtained successfully.', session.user)
    } catch {
        response(res, 500, false, 'Could not get the information')
    }
}


export { setProfileStatus, setProfileName, getProfile }