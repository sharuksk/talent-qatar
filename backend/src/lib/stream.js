import {StreamChat} from 'stream-chat';
import {StreamClient} from '@stream-io/node-sdk';
import {ENV} from './env.js';

const apiKey = ENV.STREAM_API_KEY;
const apiSecret = ENV.STREAM_API_SECRET;

if (!apiKey || !apiSecret) {
    console.error('❌ Stream API key or secret is not defined in environment variables');
    process.exit(1);
}

export const chatClient = StreamChat.getInstance(apiKey, apiSecret); //for chat messaging

export const streamClient = new StreamClient(apiKey, apiSecret); //for video calls

export const upsertStreamUser = async(userData) => {
    try {
        await chatClient.upsertUsers([userData]);
        console.log('User upserted successfully');
    }
    catch (error) {
        console.error('❌ Error upserting user to Stream:', error);
    }
}

export const deleteStreamUser = async(userId) => {
    try {
        await chatClient.deleteUser(userId);
        console.error('User deleted successfully');
    }
    catch (error) {
        console.error('❌ Error deleting user from Stream:', error);
    }
}
