import { Router } from 'express';
import { getInstitute, updateInstitute } from '../controllers/instituteController.js';
import { authenticate, requireUserTypes } from '../middleware/auth.js';
import { logoUpload } from '../middleware/upload.js';

const router = Router();

const adminOnly = [authenticate, requireUserTypes(['admin'])];

/**
 * @route GET /euonqol-api/institute
 * @desc Ottiene i dati dell'istituto che gestisce l'installazione
 */
router.get('/', ...adminOnly, getInstitute);

/**
 * @route PUT /euonqol-api/institute
 * @desc Crea/aggiorna i dati dell'istituto, opzionalmente sostituendo il logo (multipart, campo "logo")
 */
router.put('/', ...adminOnly, logoUpload, updateInstitute);

export default router;
