import { Router } from "express";
import {
  loginController,
  logoutController,
  meController,
  switchOrganizationController
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createOrganizationController } from "../controllers/organizationController.js";

export const authRoutes = Router();

authRoutes.post("/login", asyncHandler(loginController));
authRoutes.get("/me", requireAuth, asyncHandler(meController));
authRoutes.post("/logout", requireAuth, asyncHandler(logoutController));
authRoutes.post("/switch-organization", requireAuth, asyncHandler(switchOrganizationController));
authRoutes.post("/organizations", requireAuth, asyncHandler(createOrganizationController));
