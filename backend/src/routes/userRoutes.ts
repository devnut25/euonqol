import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createUserSchema, updateUserSchema } from "../validators/schemas/user.js";
import express from "express";
import * as UsersController from '../controllers/userController';
import { getSharedSurveys } from '../controllers/surveyManagerController.js';

const router = express.Router();

router.use(authenticate);

/**
 * @route   GET /euonqol-api/admin/users
 * @desc    Recupera lista utenti con paginazione e ricerca
 * @query   first, max, search
 * @access  Admin
 */
router.get('/', UsersController.getUsers);

/**
 * @route   GET /euonqol-api/admin/users/:id
 * @desc    Recupera dettagli singolo utente
 * @param   id - User ID
 * @access  Admin
 */
router.get('/:id', UsersController.getUserById);

/**
 * @route   GET /euonqol-api/users/:userId/shared-surveys
 * @desc    Get all surveys shared with a manager
 * @param   userId - Manager ID
 * @access  Admin or Manager (own surveys only)
 */
router.get('/:userId/shared-surveys', getSharedSurveys);

/**
 * @route   POST /euonqol-api/admin/users
 * @desc    Crea nuovo utente
 * @body    username, email, firstName, lastName, enabled, password, etc.
 * @access  Admin
 */
router.post('/', validate(createUserSchema), UsersController.createUser);

/**
 * @route   PUT /euonqol-api/admin/users/:id
 * @desc    Aggiorna utente esistente
 * @param   id - User ID
 * @body    email, firstName, lastName, enabled, password, etc.
 * @access  Admin
 */
router.patch('/:id', 
  validate((req) => updateUserSchema(req.params.id as string)), // ← Funzione!
  UsersController.updateUser
);

export default router;