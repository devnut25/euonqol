import express from "express";
import * as otpController from "../controllers/otpController";

const router = express.Router();

router.post("/verify-otp", otpController.verifyOTP);
router.post("/resend-otp", otpController.resendOTP);
router.post("/refresh-token", otpController.refreshToken);

export default router;