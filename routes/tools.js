import { Router } from 'express'
import { body, query } from 'express-validator'
import requestValidator from './../middlewares/requestValidator.js'
import sessionValidator from './../middlewares/sessionValidator.js'
import * as controller from './../controllers/toolsController.js'

const router = Router()

router.get(
    '/exist',
    query('id').notEmpty(),
    body('mobile').notEmpty(),
    requestValidator,
    sessionValidator,
    controller.checkMobilePhone
)

export default router
