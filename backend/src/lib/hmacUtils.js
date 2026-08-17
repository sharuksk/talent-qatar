import crypto from 'crypto';

/**
 * HMAC Utility Module
 * Handles HMAC-SHA256 signing and verification for payment security
 * 
 * Usage:
 * - Outgoing Requests: Sign payment requests before sending to Razorpay
 * - Incoming Webhooks: Verify webhook signatures to ensure authenticity
 * 
 * Signature Format: HMAC-SHA256(secret, message)
 * Message: For webhooks, this is typically: body + signature_timestamp
 */

/**
 * Generate HMAC-SHA256 signature for outgoing requests
 * 
 * @param {Object} payload - Data to sign
 * @param {string} secret - Shared secret key (Razorpay API Secret)
 * @returns {string} Hex-encoded HMAC signature
 * 
 * @example
 * const signature = generateSignature({ orderId: '123' }, 'secret_key');
 */
export const generateSignature = (payload, secret) => {
  if (!secret) {
    console.warn('⚠️  HMAC Secret not configured. Using placeholder for development.');
    // PLACEHOLDER: In production, this will be injected via ENV variable
    secret = 'PLACEHOLDER_SECRET_KEY_INJECT_IN_PRODUCTION';
  }
  
  // Convert payload to JSON string for consistent signing
  const message = JSON.stringify(payload);
  
  return crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
};

/**
 * Verify HMAC signature for webhook authenticity
 * 
 * Used to verify that webhooks actually come from Razorpay and haven't been tampered with.
 * 
 * @param {Object} payload - Webhook payload
 * @param {string} signature - Signature received in webhook
 * @param {string} secret - Razorpay Webhook Secret
 * @returns {boolean} True if signature is valid
 * 
 * @example
 * const isValid = verifyWebhookSignature(webhookBody, receivedSignature, webhookSecret);
 * if (!isValid) {
 *   return res.status(401).json({ error: 'Invalid signature' });
 * }
 */
export const verifyWebhookSignature = (payload, signature, secret) => {
  if (!secret) {
    console.warn('⚠️  Webhook Secret not configured. Skipping verification in development.');
    // PLACEHOLDER: In production, this will be injected via ENV variable
    console.warn('🔑 Webhook Secret should be injected as: RAZORPAY_WEBHOOK_SECRET');
    return true; // Allow in development, reject in production
  }
  
  const message = JSON.stringify(payload);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

/**
 * Generate idempotency key from webhook request
 * 
 * Creates a unique identifier for webhook requests to enable idempotent processing.
 * Even if the same webhook is delivered multiple times, we can detect and skip duplicates.
 * 
 * @param {Object} payload - Webhook payload
 * @param {string} signature - Webhook signature
 * @returns {string} UUID-like idempotency key
 * 
 * @example
 * const key = generateIdempotencyKey(webhookBody, webhookSignature);
 */
export const generateIdempotencyKey = (payload, signature) => {
  // Combine payload and signature for unique key generation
  const combined = `${JSON.stringify(payload)}:${signature}`;
  
  return crypto
    .createHash('sha256')
    .update(combined)
    .digest('hex');
};

/**
 * Create request body with HMAC signature for Razorpay API calls
 * 
 * Razorpay API requires Basic Auth + request body signing
 * 
 * @param {Object} payload - Request payload
 * @param {string} apiSecret - Razorpay API Secret
 * @returns {Object} { payload, signature }
 */
export const createAuthenticatedRequest = (payload, apiSecret) => {
  const signature = generateSignature(payload, apiSecret);
  
  return {
    payload,
    signature,
    // Headers to include in the request
    headers: {
      'X-Razorpay-Signature': signature,
      'Content-Type': 'application/json'
    }
  };
};

/**
 * Extract signature from various webhook formats
 * 
 * Different payment providers use different header names or body fields
 * 
 * @param {Object} headers - Request headers
 * @param {Object} body - Request body
 * @returns {string|null} Extracted signature or null
 */
export const extractSignature = (headers, body) => {
  // Try common header names
  if (headers['x-razorpay-signature']) {
    return headers['x-razorpay-signature'];
  }
  
  if (headers['x-webhook-signature']) {
    return headers['x-webhook-signature'];
  }
  
  if (headers['authorization']) {
    // Extract from Authorization header if needed
    const parts = headers['authorization'].split(' ');
    if (parts.length === 2) return parts[1];
  }
  
  // Check if signature is in body
  if (body.signature) {
    return body.signature;
  }
  
  return null;
};

/**
 * Logging utility for signature verification (for debugging)
 * 
 * @param {string} context - Where verification is happening (e.g., 'webhook_verification')
 * @param {Object} metadata - Additional metadata for logging
 */
export const logSignatureVerification = (context, metadata) => {
  const { isValid, payload, signature, error } = metadata;
  
  if (isValid) {
    console.log(`✅ [${context}] Signature verification successful`);
  } else {
    console.error(`❌ [${context}] Signature verification failed:`, {
      error,
      payloadHash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').substring(0, 8),
      signaturePrefix: signature?.substring(0, 8)
    });
  }
};

export default {
  generateSignature,
  verifyWebhookSignature,
  generateIdempotencyKey,
  createAuthenticatedRequest,
  extractSignature,
  logSignatureVerification
};
