import express from "express";
import * as authController from "../controllers/authController";

const router = express.Router();

// Autenticazione
router.post("/login", authController.login);
router.post("/update-password", authController.updatePassword);
router.post("/logout", authController.logout);
router.post('/validate-session', authController.validateSession);

// Reset password
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

export default router;