import { Router } from 'express';
import {
  getCatApiSettings,
  getEmailSettings,
  sendTestEmail,
  testCatApiConnection,
  updateCatApiSettings,
  updateEmailSettings,
} from '../controllers/appSettingsController.js';
import { getUiTranslations, saveUiTranslation } from '../controllers/uiTranslationController.js';
import { authenticate, requireUserTypes } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { saveUiTranslationSchema } from '../validators/schemas/uiTranslation.js';

const router = Router();

const adminOnly = [authenticate, requireUserTypes(['admin'])];

/**
 * @route GET /euonqol-api/settings/email
 * @desc Ottiene la configurazione della mail di servizio (senza esporre i segreti)
 */
router.get('/email', ...adminOnly, getEmailSettings);

/**
 * @route PUT /euonqol-api/settings/email
 * @desc Aggiorna la configurazione della mail di servizio
 */
router.put('/email', ...adminOnly, updateEmailSettings);

/**
 * @route POST /euonqol-api/settings/email/test
 * @desc Invia una mail di test con la configurazione salvata (o con l'override passato nel body)
 */
router.post('/email/test', ...adminOnly, sendTestEmail);

/**
 * @route GET /euonqol-api/settings/cat-api
 * @desc Ottiene la configurazione dell'API CAT esterna (senza esporre la chiave)
 */
router.get('/cat-api', ...adminOnly, getCatApiSettings);

/**
 * @route PUT /euonqol-api/settings/cat-api
 * @desc Aggiorna url/chiave/scadenza dell'API CAT esterna
 */
router.put('/cat-api', ...adminOnly, updateCatApiSettings);

/**
 * @route POST /euonqol-api/settings/cat-api/test
 * @desc Verifica la connessione all'API CAT con la configurazione salvata (o l'override passato nel body)
 */
router.post('/cat-api/test', ...adminOnly, testCatApiConnection);

/**
 * @route GET /euonqol-api/settings/ui-translations?filter[language_id]=&search=&sort=&page=&per_page=
 * @desc Lista paginata dei testi UI della pagina pubblica per una lingua (senza filtro: inglese)
 */
router.get('/ui-translations', ...adminOnly, getUiTranslations);

/**
 * @route PUT /euonqol-api/settings/ui-translations/:key
 * @desc Salva un singolo testo UI di una lingua (valore vuoto = torna al fallback inglese)
 */
router.put('/ui-translations/:key', ...adminOnly, validate(saveUiTranslationSchema), saveUiTranslation);

export default router;
