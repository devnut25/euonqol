import { Router } from 'express';
import { getLanguages, getLanguagesAll } from '../controllers/languagesController.js';
import { authenticate, requireUserTypes } from '../middleware/auth.js';

const router = Router();

router.get('/all', authenticate, requireUserTypes(['admin', 'manager']), getLanguagesAll);
router.get('/', authenticate, requireUserTypes(['admin', 'manager']), getLanguages);

export default router;
