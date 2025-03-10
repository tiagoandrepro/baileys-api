import { Router } from 'express'
import { body, query } from 'express-validator'
import requestValidator from './../middlewares/requestValidator.js'
import sessionValidator from './../middlewares/sessionValidator.js'
import * as controller from './../controllers/groupsController.js'
import getMessages from './../controllers/getMessages.js'

const router = Router()

router.get('/', query('id').notEmpty(), requestValidator, sessionValidator, controller.getList)

router.get('/:jid', query('id').notEmpty(), requestValidator, sessionValidator, getMessages)

router.get('/meta/:jid', query('id').notEmpty(), requestValidator, sessionValidator, controller.getGroupMetaData)


router.post(
    '/send',
    query('id').notEmpty(),
    body('receiver').notEmpty(),
    body('message').notEmpty(),
    requestValidator,
    sessionValidator,
    controller.send
)


router.get('/code/:jid', query('id').notEmpty(), requestValidator, sessionValidator,    controller.groupInviteCode)



router.post('/leave/:jid', query('id').notEmpty(), requestValidator, sessionValidator,  controller.groupLeave)

router.post('/participants-update', query('id').notEmpty(), requestValidator, sessionValidator,  controller.groupParticipantsUpdate)



export default router
