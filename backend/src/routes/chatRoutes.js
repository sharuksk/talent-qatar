import express from "express";
import { getStreamToken } from "../controllers/chatController.js";
import { protectedRoute } from "../middleware/protectRoute.js";

const router = express.Router();

router.get('/token',protectedRoute, getStreamToken)

export default router;