import express from 'express';
import * as CountryController from '../controllers/countryController';

const router = express.Router();

/**
 * @route   GET /euonqol-api/countries
 * @desc    Get list of all EU countries / languages
 * @access  Public
 */
router.get('/', CountryController.getCountries);

export default router;
