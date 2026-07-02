import { Router } from "express";
import {
  loginController,
  logoutController,
  meController
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRoutes = Router();

authRoutes.post("/login", asyncHandler(loginController));
authRoutes.get("/me", requireAuth, asyncHandler(meController));
authRoutes.post("/logout", requireAuth, asyncHandler(logoutController));
