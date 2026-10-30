import { Router } from 'express';
import { createLanguage, getLanguages, getLanguagesAll } from '../controllers/languagesController.js';
import { authenticate, requireUserTypes } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createLanguageSchema } from '../validators/schemas/language.js';

const router = Router();

router.get('/all', authenticate, requireUserTypes(['admin', 'manager']), getLanguagesAll);
router.get('/', authenticate, requireUserTypes(['admin', 'manager']), getLanguages);

// Add a language — languages are append-only, there is no PUT/PATCH/DELETE (admin only)
router.post('/', authenticate, requireUserTypes(['admin']), validate(createLanguageSchema), createLanguage);

export default router;
