import express from "express";
import { protectedRoute } from "../middleware/protectRoute.js";
import { createSession, getActiveSessions, getMyRecentSessions, getSessionById, joinSession, endSession} from "../controllers/sessionController.js";

const router = express.Router();

router.post('/',protectedRoute, createSession);
router.get('/active',protectedRoute, getActiveSessions);
router.get('/my-recent',protectedRoute, getMyRecentSessions);

// api/sessions/:id
router.get('/:id',protectedRoute, getSessionById);
router.post('/:id/join',protectedRoute, joinSession);
router.get('/:id/end',protectedRoute, endSession);

export default router;