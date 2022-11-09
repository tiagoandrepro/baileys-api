import { Router } from 'express'
import { body, query } from 'express-validator'
import requestValidator from './../middlewares/requestValidator.js'
import sessionValidator from './../middlewares/sessionValidator.js'
import * as controller from './../controllers/miscControlls.js'

const router = Router()

router.post('/update-profile-status', query('id').notEmpty(), body('status').notEmpty(), requestValidator, sessionValidator, controller.setProfileStatus)


export default router
