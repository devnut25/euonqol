import { Router } from 'express';
import * as ModuleController from '../controllers/moduleController';
import { authenticate, requireUserTypes } from '../middleware/auth';

const router = Router();

/**
 * GET /euonqol-api/modules
 * Lista tutti i moduli con filtri
 */
router.get('/', ModuleController.getModules);

/**
 * POST /euonqol-api/modules
 * Crea un nuovo modulo (SOLO ADMIN)
 */
router.post('/', authenticate, requireUserTypes(['admin']), ModuleController.createModule);

/**
 * GET /euonqol-api/modules/all
 * Active modules for a patient group OR type feedback/socio-demo
 */
router.get('/all', ModuleController.getModulesAll);

/**
 * GET /euonqol-api/modules/:id
 * Dettagli di un modulo specifico
 */
router.get('/:id', ModuleController.getModuleById);

/**
 * PUT /euonqol-api/modules/:id
 * Aggiorna un modulo esistente (SOLO ADMIN)
 */
router.patch('/:id', authenticate, requireUserTypes(['admin']), ModuleController.updateModule);

/**
 * DELETE /euonqol-api/modules/:id
 * Elimina un modulo (solo se non usato in questionari) (SOLO ADMIN)
 */
router.delete('/:id', authenticate, requireUserTypes(['admin']), ModuleController.deleteModule);

/**
 * GET /euonqol-api/modules/:id/questions
 * Ottiene tutte le domande di un modulo ordinate per position
 */
router.get('/:id/questions', ModuleController.getModuleQuestions);

/**
 * PUT /euonqol-api/modules/:id/questions
 * Bulk update delle domande con riordinamento (SOLO ADMIN)
 */
router.put(
  '/:id/questions',
  authenticate,
  requireUserTypes(['admin']),
  ModuleController.updateModuleQuestions
);

export default router;
