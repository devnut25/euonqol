import express from 'express';
import * as KitController from '../controllers/kitController';
import { authenticate, requireUserTypes } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createKitVersionSchema } from '../validators/schemas/kitVersion';

const router = express.Router();

/**
 * @route   GET /euonqol-api/kit-versions
 * @desc    Get list of kit versions with pagination
 * @query   search, page, pageSize
 * @access  Authenticated
 */
router.get('/', authenticate, requireUserTypes(['admin']), KitController.getKitVersions);

/**
 * @route   GET /euonqol-api/kit-versions/template/:type
 * @desc    Download the Excel template for a given kit type (static, cat, socio-demo)
 * @access  Admin only
 * NOTE: Must come BEFORE /:id to prevent 'template' being parsed as an ID
 */
router.get(
  '/template/:type',
  authenticate,
  requireUserTypes(['admin']),
  KitController.downloadKitTemplate
);

/**
 * @route   GET /euonqol-api/kit-versions/:id
 * @desc    Get details of a specific kit version
 * @param   id - Kit version ID
 * @access  Authenticated
 */
router.get('/:id', authenticate, requireUserTypes(['admin']), KitController.getKitVersionById);

/**
 * @route   GET /euonqol-api/kit-versions/:id/questions
 * @desc    Get all questions for a kit version with optional filters
 * @param   id - Kit version ID
 * @query   patientGroupId, questionType, languageId, page, pageSize
 * @access  Authenticated
 */
router.get(
  '/:id/questions',
  authenticate,
  requireUserTypes(['admin']),
  KitController.getKitVersionQuestions
);

/**
 * @route   GET /euonqol-api/kit-versions/:id/languages
 * @desc    Get distinct languages available for this kit version
 * @param   id - Kit version ID
 * @access  Admin only
 */
router.get(
  '/:id/languages',
  authenticate,
  requireUserTypes(['admin']),
  KitController.getKitVersionLanguages
);

/**
 * @route   POST /euonqol-api/kit-versions
 * @desc    Create a new kit version
 * @body    { name, status? }
 * @access  Admin only
 */
router.post(
  '/',
  authenticate,
  requireUserTypes(['admin']),
  validate(createKitVersionSchema),
  KitController.createKitVersion
);

/**
 * @route   PUT /euonqol-api/kit-versions/:id
 * @desc    Update an existing kit version
 * @param   id - Kit version ID
 * @body    { name?, status? }
 * @access  Admin only
 */
router.put('/:id', authenticate, requireUserTypes(['admin']), KitController.updateKitVersion);

/**
 * @route   DELETE /euonqol-api/kit-versions/:id
 * @desc    Disable a kit version (soft delete)
 * @param   id - Kit version ID
 * @access  Admin only
 */
router.delete('/:id', authenticate, requireUserTypes(['admin']), KitController.deleteKitVersion);

export default router;
