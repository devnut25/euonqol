import express from 'express';
import * as AnswerController from '../controllers/answerController';

const router = express.Router();

/**
 * @route   GET /euonqol-api/answer-profiles
 * @desc    Get list of answer profiles with pagination
 * @query   search, page, pageSize
 * @access  Public (for now, can add authenticate later)
 */
router.get('/', AnswerController.getAnswerProfiles);

/**
 * @route   GET /euonqol-api/answer-profiles/:code/options
 * @desc    Get answer options with translations for a specific profile
 * @param   code - Answer profile code
 * @query   languageId - Required language ID
 * @access  Public
 */
router.get('/:code/options', AnswerController.getAnswerProfileOptions);

export default router;
