import dotenv from 'dotenv';

dotenv.config({quiet: true});

export const ENV ={
    PORT: process.env.PORT,
    DB_URL: process.env.DB_URL,
    NODE_ENV: process.env.NODE_ENV,
    CLIENT_URL: process.env.CLIENT_URL,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    STREAM_API_KEY: process.env.STREAM_API_KEY,
    STREAM_API_SECRET: process.env.STREAM_API_SECRET,
    
    // ============================================
    // RAZORPAY PAYMENT INTEGRATION
    // ============================================
    // 
    // Razorpay is a FREE sandbox payment service
    // Get credentials: https://dashboard.razorpay.com/app/settings/api-tokens
    // 
    // Mode: SANDBOX (Test) credentials for development
    // Type: LIVE credentials for production (only after testing)
    //
    
    // Razorpay API Key ID (for Basic Auth)
    // PLACEHOLDER: Will be injected via environment variable
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'PLACEHOLDER_KEY_ID',
    
    // Razorpay API Key Secret (for Basic Auth)
    // PLACEHOLDER: Will be injected via environment variable
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'PLACEHOLDER_KEY_SECRET',
    
    // Razorpay Webhook Secret (for HMAC signature verification)
    // PLACEHOLDER: Will be injected via environment variable
    // Get this from: Dashboard > Settings > Webhook > Copy Secret
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || 'PLACEHOLDER_WEBHOOK_SECRET',
    
    // API Base URL (for webhook callbacks)
    // Used in payment links and callback URLs
    API_URL: process.env.API_URL || 'http://localhost:3001'
};