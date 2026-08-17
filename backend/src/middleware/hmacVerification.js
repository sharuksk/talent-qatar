import { verifyWebhookSignature, extractSignature, logSignatureVerification } from '../lib/hmacUtils.js';
import { ENV } from '../lib/env.js';

/**
 * HMAC Verification Middleware
 * 
 * Verifies that incoming webhook requests have valid HMAC signatures.
 * This ensures the webhook actually came from Razorpay and hasn't been tampered with.
 * 
 * Placement: Use BEFORE parsing JSON in the route
 * 
 * @example
 * // In routes: MUST be defined BEFORE express.json()
 * app.use(express.raw({ type: 'application/json' }));
 * app.post('/webhook', hmacVerificationMiddleware, express.json(), webhookHandler);
 */
export const hmacVerificationMiddleware = (req, res, next) => {
  try {
    // Store raw body for signature verification
    // This must be done BEFORE JSON parsing, so we need raw body access
    let rawBody = '';

    req.on('data', chunk => {
      rawBody += chunk.toString('utf8');
    });

    req.on('end', () => {
      try {
        // Parse the body
        req.body = JSON.parse(rawBody);
        req.rawBody = rawBody;

        // Extract signature from headers
        const signature = extractSignature(req.headers, req.body);

        if (!signature) {
          console.warn('⚠️  No HMAC signature found in webhook request');
          console.warn('Expected signature in: X-Razorpay-Signature header or body.signature field');
          
          // In development, allow missing signatures; in production, reject
          if (process.env.NODE_ENV === 'production') {
            return res.status(401).json({
              error: 'Missing HMAC signature',
              message: 'Webhook request must include valid HMAC signature'
            });
          }
          
          // Store signature verification status for logging
          req.signatureValid = null;
          req.signatureVerificationSkipped = true;
          return next();
        }

        // Get webhook secret from environment
        const webhookSecret = ENV.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;

        if (!webhookSecret || webhookSecret.includes('PLACEHOLDER')) {
          console.warn('⚠️  RAZORPAY_WEBHOOK_SECRET not configured');
          console.warn('📝 Webhook signature verification is DISABLED for development');
          console.warn('🔑 Set RAZORPAY_WEBHOOK_SECRET to enable verification');
          
          req.signatureValid = null;
          req.signatureVerificationSkipped = true;
          return next();
        }

        // Verify the signature
        const isValid = verifyWebhookSignature(req.body, signature, webhookSecret);

        // Log verification result
        logSignatureVerification('webhook_hmac_verification', {
          isValid,
          payload: req.body,
          signature: signature.substring(0, 16) + '...',
          error: isValid ? null : 'Signature mismatch'
        });

        // Store signature verification result
        req.signatureValid = isValid;
        req.receivedSignature = signature;

        if (!isValid) {
          console.error('❌ HMAC signature verification failed');
          console.error('Webhook will NOT be processed to prevent tampering');
          
          return res.status(401).json({
            error: 'Invalid HMAC signature',
            message: 'Webhook signature verification failed. Request may be tampered.',
            receivedSignature: signature.substring(0, 16) + '...'
          });
        }

        console.log('✅ HMAC signature verified successfully');
        next();
      } catch (error) {
        console.error('Error in HMAC verification:', error.message);
        return res.status(400).json({
          error: 'Invalid request format',
          message: error.message
        });
      }
    });
  } catch (error) {
    console.error('Error setting up HMAC verification:', error.message);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'HMAC verification setup failed'
    });
  }
};

/**
 * Signature Verification Status Middleware
 * 
 * Checks that the previous request passed signature verification.
 * Use this AFTER hmacVerificationMiddleware on webhook routes.
 * 
 * @example
 * app.post('/webhook', hmacVerificationMiddleware, requireValidSignature, webhookHandler);
 */
export const requireValidSignature = (req, res, next) => {
  // Check if signature was explicitly disabled (development mode)
  if (req.signatureVerificationSkipped === true) {
    console.warn('⚠️  Webhook signature verification is SKIPPED (development mode)');
    // In development, allow the request through
    return next();
  }

  // Check if signature verification result exists
  if (req.signatureValid === null) {
    return res.status(400).json({
      error: 'No signature to verify',
      message: 'HMAC signature verification was not performed'
    });
  }

  // Check if signature is valid
  if (!req.signatureValid) {
    return res.status(401).json({
      error: 'Signature verification failed',
      message: 'Invalid HMAC signature. Request rejected.'
    });
  }

  // Signature is valid, proceed
  next();
};

/**
 * HMAC Signature Logging Middleware
 * 
 * Logs webhook signature information for audit trail and debugging.
 * Use this on webhook routes to track all signature verification attempts.
 * 
 * @example
 * app.post('/webhook', hmacVerificationMiddleware, logSignatureInfo, webhookHandler);
 */
export const logSignatureInfo = (req, res, next) => {
  // Add signature info to request for later logging
  req.signatureInfo = {
    timestamp: new Date().toISOString(),
    verified: req.signatureValid,
    skipped: req.signatureVerificationSkipped,
    signature: req.receivedSignature ? req.receivedSignature.substring(0, 16) + '...' : null,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent']
  };

  // Log before processing
  console.log('📨 Webhook received:', {
    method: req.method,
    path: req.path,
    signature: req.signatureInfo.signature,
    verified: req.signatureInfo.verified,
    ip: req.signatureInfo.ip
  });

  // Store original send method to log response
  const originalSend = res.send;
  res.send = function(data) {
    const statusCode = res.statusCode;
    
    if (statusCode >= 400) {
      console.error('❌ Webhook response error:', {
        status: statusCode,
        error: typeof data === 'string' ? data : data?.error || data?.message
      });
    } else {
      console.log('✅ Webhook processed successfully:', {
        status: statusCode
      });
    }
    
    return originalSend.call(this, data);
  };

  next();
};

export default {
  hmacVerificationMiddleware,
  requireValidSignature,
  logSignatureInfo
};
