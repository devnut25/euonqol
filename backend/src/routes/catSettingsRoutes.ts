import { Router } from 'express';
import {
  bulkCreateCatSettings,
  checkMissingCatSettings,
  createCatSetting,
  deleteCatSetting,
  fetchFromCatApi,
  getCatSettingById,
  getCatSettings,
  updateCatSetting,
} from '../controllers/catSettingsController';
import { authenticate, requireUserTypes } from '../middleware/auth';

const router = Router();

const adminOnly = [authenticate, requireUserTypes(['admin'])];

/**
 * @route GET /euonqol-api/cat-settings
 * @desc Lista tutti i CAT settings disponibili
 */
router.get('/', ...adminOnly, getCatSettings);

/**
 * @route GET /euonqol-api/cat-settings/fetch-from-cat/:settingKey
 * @desc Proxy verso CAT API esterna — recupera api_configuration per settingKey
 * NOTE: must be before /:id
 */
router.get('/fetch-from-cat/:settingKey', ...adminOnly, fetchFromCatApi);

/**
 * @route POST /euonqol-api/cat-settings/check-missing
 * @desc Given a list of setting_key values, returns which don't exist yet.
 * NOTE: must be before /:id
 */
router.post('/check-missing', ...adminOnly, checkMissingCatSettings);

/**
 * @route POST /euonqol-api/cat-settings/bulk
 * @desc Bulk-creates CAT settings, skipping ones that already exist by setting_key.
 * NOTE: must be before /:id
 */
router.post('/bulk', ...adminOnly, bulkCreateCatSettings);

/**
 * @route GET /euonqol-api/cat-settings/:id
 * @desc Ottiene un singolo CAT setting per ID
 */
router.get('/:id', ...adminOnly, getCatSettingById);

/**
 * @route POST /euonqol-api/cat-settings
 * @desc Crea un nuovo CAT setting
 */
router.post('/', ...adminOnly, createCatSetting);

/**
 * @route PATCH /euonqol-api/cat-settings/:id
 * @desc Aggiorna un CAT setting esistente
 */
router.patch('/:id', ...adminOnly, updateCatSetting);

/**
 * @route DELETE /euonqol-api/cat-settings/:id
 * @desc Elimina un CAT setting esistente
 */
router.delete('/:id', ...adminOnly, deleteCatSetting);

export default router;
