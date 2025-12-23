import { chatClient, streamClient } from "../lib/stream.js";
import Session from "../models/Session.js";

export async function createSession(req, res) {
    try {
        const {problem, difficulty} = req.body;
        const userId = req.user._id;
        const clerkId = req.user.clerkId;

        if (!problem || !difficulty) {
            return res.status(400).json({ msg: "Problem and difficulty are required" });
        }

        //generate unique session code for calls
        const callId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        //create stream in db
        const session = await Session.create(
            {problem, difficulty, host: userId, callId}
        );

        // create stream video call
        await streamClient.video.call("default", callId).getOrCreate(
            {
                data: {
                    created_by_id: clerkId,
                    custom: {
                        sessionId: session._id.toString(),
                        problem,
                        difficulty,
                    },                    
                }
            }
        );

        //chat messaging
        const channel = chatClient.channel("messaging", callId, {
            name: `Session on ${problem}`,
            created_by_id: clerkId,
            members: [clerkId]
        });

        await channel.create();

        res.status(201).json({ 
            msg: "Session created successfully", 
            sessionId: session._id,
            callId,
        });
    } 
    catch (error) {
        res.status(500).json({ msg: "Server Error in creating session" });
    }
}

export async function getActiveSessions(_, res) {
    try {
        const sessions = await Session.find({ status: 'active' })
            .populate('host', 'name profileImage email clerkId')
            .sort({ createdAt: -1 })
            .limit(20); 
        res.status(200).json({ sessions });
    } catch (error) {
        res.status(500).json({ msg: "Server Error in fetching active sessions" });
    }
}

export async function getMyRecentSessions(req, res) {
    try {
        // fetch sessions where the user is host or participant
        const userId = req.user._id;
        const sessions = await Session.find({ 
            status: 'completed',
            $or: [{host: userId}, {participant: userId}] 
        }).sort({ createdAt: -1 }).limit(20); 
        res.status(200).json({ sessions });
    } catch (error) {
        res.status(500).json({ msg: "Server Error in fetching recent sessions" });
    }
}

export async function getSessionById(req, res) {
    try {
        const sessionId = req.params.id;
        const session = await Session.findById(sessionId)
            .populate('host', 'name profileImage email clerkId')
            .populate('participant', 'name profileImage email clerkId');
        if (!session) {
            return res.status(404).json({ msg: "Session not found" });
        }
        res.status(200).json({ session });
    } catch (error) {
        res.status(500).json({ msg: "Server Error in fetching session details" });
    }
}

export async function joinSession(req, res) {
    try {
        const sessionId = req.params.id;
        const userId = req.user._id;
        const clerkId = req.user.clerkId;
        const session = await Session.findById(sessionId);
        if (!session) {
            return res.status(404).json({ msg: "Session not found" });
        }
        if (session.status !== 'active') {
            return res.status(400).json({ msg: "Cannot join a non-active session" });
        }
        // check session is already full (limit 2)
        if (session.participant) {
            return res.status(400).json({ msg: "Session is already full" });
        }
        session.participant = userId;
        await session.save();
        
        // add participant to stream video call
        // await streamClient.video.call("default", session.callId).addParticipant(clerkId, {
        //     data: {
        //         joined_at: new Date().toISOString(),
        //     }
        // }); 
        // add participant to chat channel
        const channel = chatClient.channel("messaging", session.callId);
        await channel.addMembers([clerkId]);
        res.status(200).json({ msg: "Joined session successfully", callId: session.callId });
    } catch (error) {
        res.status(500).json({ msg: "Server Error in joining session" });
    }
}

export async function endSession(req, res) {
    try {
        const sessionId = req.params.id;
        const userId = req.user._id;
        const session = await Session.findById(sessionId);
        if (!session) {
            return res.status(404).json({ msg: "Session not found" });
        }
        // check the host is not the host
        if (session.host.toString() !== userId.toString()) {
            return res.status(403).json({ msg: "Only the host can end the session" });
        }
        // checl the status is already completed
        if (session.status === 'completed') {
            return res.status(400).json({ msg: "Session is already completed" });
        }
        session.status = 'completed';
        await session.save();

        //kill the chat and video call sessions
        const call = streamClient.video.call("default", session.callId);
        await call.delete({hard: true});
        const channel = chatClient.channel("messaging", session.callId);
        await channel.delete();
        
        res.status(200).json({ msg: "Session ended successfully" });
    } catch (error) {
        res.status(500).json({ msg: "Server Error in ending session" });
    }
}