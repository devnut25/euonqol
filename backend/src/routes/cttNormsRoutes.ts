import { Router } from 'express';
import {
  createCttNormsVersion,
  deleteCttNormsVersion,
  getCttNormsAll,
  getCttNormsVersionById,
  getCttNormsVersions,
  updateCttNormsVersion,
} from '../controllers/cttNormsController.js';
import { authenticate, requireUserTypes } from '../middleware/auth.js';

const router = Router();

/**
 * CTT Norms Version routes
 * Base path: /euonqol-api/ctt-norms
 */

// List all versions (admin + manager)
router.get('/', authenticate, requireUserTypes(['admin', 'manager']), getCttNormsVersions);

// Get all active versions for selects — must be before /:id (admin + manager)
router.get('/all', authenticate, requireUserTypes(['admin', 'manager']), getCttNormsAll);

// Get single version (admin + manager)
router.get('/:id', authenticate, requireUserTypes(['admin', 'manager']), getCttNormsVersionById);

// Create version (admin only)
router.post('/', authenticate, requireUserTypes(['admin']), createCttNormsVersion);

// Update version — blocked if already used by a survey (admin only)
router.put('/:id', authenticate, requireUserTypes(['admin']), updateCttNormsVersion);
router.patch('/:id', authenticate, requireUserTypes(['admin']), updateCttNormsVersion);

// Delete version — blocked if already used by a survey (admin only)
router.delete('/:id', authenticate, requireUserTypes(['admin']), deleteCttNormsVersion);

export default router;
