import { chatClient } from "../lib/stream.js";

export async function getStreamToken(req, res) {
    try {
        // steam user clerkId so it should match 
        const token = chatClient.createToken(req.user.clerkId);
        res.status(200).json({ 
            token, 
            userId: req.user.clerkId,
            userName: req.user.name,
            userImage: req.user.image,
        });
    } catch (error) {
        res.status(500).json({ msg: "Server Error in generating stream token" });
    }
}