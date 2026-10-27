import { Router } from 'express';
import {
  createCatItemBank,
  deleteCatItemBank,
  downloadCatItemBankTemplate,
  getCatItemBankById,
  getCatItemBankQuestionnaires,
  getCatItemBankQuestions,
  getCatItemBankScales,
  getCatItemBanks,
  updateCatItemBank,
  updateCatItemBankScale,
  uploadCatItemBankItems,
} from '../controllers/catItemBankController';
import { authenticate, requireUserTypes } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createCatItemBankSchema } from '../validators/schemas/catItemBank';

const router = Router();

const adminOnly = [authenticate, requireUserTypes(['admin'])];

/**
 * @route GET /euonqol-api/cat-item-banks
 * @desc Lists all reusable CAT item banks
 */
router.get('/', ...adminOnly, getCatItemBanks);

/**
 * @route GET /euonqol-api/cat-item-banks/template
 * @desc Download the Excel template for uploading items into a CAT Item Bank
 * NOTE: must be before /:id
 */
router.get('/template', ...adminOnly, downloadCatItemBankTemplate);

/**
 * @route GET /euonqol-api/cat-item-banks/:id
 * @desc Returns a single CAT item bank (with its scale mappings)
 */
router.get('/:id', ...adminOnly, getCatItemBankById);

/**
 * @route POST /euonqol-api/cat-item-banks/:id/upload
 * @desc Imports raw CAT items (CATquestions/Answers/Languages sheets) into a bank
 */
router.post('/:id/upload', ...adminOnly, uploadCatItemBankItems);

/**
 * @route GET /euonqol-api/cat-item-banks/:id/questions
 * @desc Read-only, paginated browse of a bank's CAT items
 */
router.get('/:id/questions', ...adminOnly, getCatItemBankQuestions);

/**
 * @route GET /euonqol-api/cat-item-banks/:id/scales
 * @desc Lists a bank's ScaleCode -> cat_setting mappings
 */
router.get('/:id/scales', ...adminOnly, getCatItemBankScales);

/**
 * @route GET /euonqol-api/cat-item-banks/:id/questionnaires
 * @desc Paginated questionnaires that include one of the bank's dynamic modules
 */
router.get('/:id/questionnaires', ...adminOnly, getCatItemBankQuestionnaires);

/**
 * @route PATCH /euonqol-api/cat-item-banks/:id/scales/:scaleId
 * @desc Repoints a ScaleCode -> cat_setting mapping without a full re-upload
 */
router.patch('/:id/scales/:scaleId', ...adminOnly, updateCatItemBankScale);

/**
 * @route POST /euonqol-api/cat-item-banks
 * @desc Creates a new CAT item bank
 */
router.post('/', ...adminOnly, validate(createCatItemBankSchema), createCatItemBank);

/**
 * @route PATCH /euonqol-api/cat-item-banks/:id
 * @desc Updates an existing CAT item bank
 */
router.patch('/:id', ...adminOnly, updateCatItemBank);

/**
 * @route DELETE /euonqol-api/cat-item-banks/:id
 * @desc Deletes a CAT item bank (blocked if still in use by any module)
 */
router.delete('/:id', ...adminOnly, deleteCatItemBank);

export default router;
