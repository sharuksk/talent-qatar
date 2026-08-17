import IdempotencyKey from '../models/IdempotencyKey.js';
import { generateIdempotencyKey } from '../lib/hmacUtils.js';

/**
 * Idempotency Middleware
 * 
 * Prevents duplicate webhook processing by tracking and checking idempotency keys.
 * 
 * How it works:
 * 1. Generate unique key from webhook signature + payload
 * 2. Check if key was already processed
 * 3. If yes, return cached response immediately
 * 4. If no, allow request to proceed and store result
 * 
 * This protects against:
 * - Network retries (webhook delivered twice)
 * - User double-clicking payment button
 * - Race conditions in payment processing
 * 
 * Usage:
 * app.post('/webhook', hmacVerificationMiddleware, idempotencyMiddleware, webhookHandler);
 */
export const idempotencyMiddleware = async (req, res, next) => {
  try {
    // Only apply to POST/PUT requests that modify state
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    // Extract request ID (usually from headers)
    const requestId = req.headers['x-request-id'] ||
                     req.headers['idempotency-key'] ||
                     req.body?.id ||
                     null;

    // Extract webhook signature for key generation
    const signature = req.receivedSignature || 
                     req.headers['x-razorpay-signature'] ||
                     '';

    // If we can't generate a reliable key, skip idempotency check
    if (!requestId && !signature) {
      console.warn('⚠️  Unable to generate idempotency key. Request lacks ID or signature.');
      return next();
    }

    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey(req.body, signature);

    // Check if this key was already processed
    const existingEntry = await IdempotencyKey.findOne({
      idempotencyKey
    });

    if (existingEntry) {
      console.log(`♻️  Idempotent request detected. Returning cached response.`, {
        idempotencyKey: idempotencyKey.substring(0, 16) + '...',
        processedAt: existingEntry.processedAt,
        retryCount: existingEntry.retryCount + 1
      });

      // Log this retry attempt
      await IdempotencyKey.updateOne(
        { idempotencyKey },
        {
          $inc: { retryCount: 1 },
          $push: {
            retries: {
              timestamp: new Date(),
              ipAddress: req.ip || req.connection.remoteAddress,
              userAgent: req.headers['user-agent']
            }
          }
        }
      );

      // Return cached response immediately
      return res.status(existingEntry.responseStatus || 200).json({
        cached: true,
        processedAt: existingEntry.processedAt,
        retryCount: existingEntry.retryCount + 1,
        response: existingEntry.responseData
      });
    }

    // This is a new request, store the idempotency key
    req.idempotencyKey = idempotencyKey;
    req.requestId = requestId;
    req.isIdempotentRequest = true;

    // Capture the original response to cache it
    const originalSend = res.send;

    res.send = async function(data) {
      try {
        // Parse response data if it's a JSON string
        let responseData = data;
        if (typeof data === 'string') {
          try {
            responseData = JSON.parse(data);
          } catch (e) {
            responseData = { message: data };
          }
        }

        // Store the idempotency entry ONLY if response was successful
        if (res.statusCode < 400) {
          await IdempotencyKey.create({
            idempotencyKey,
            requestId: req.requestId,
            paymentId: req.body?.id || req.body?.payment_id || null,
            webhookType: req.body?.event || 'unknown',
            requestSignature: signature.substring(0, 64), // Store first 64 chars
            requestPayload: req.body,
            responseStatus: res.statusCode,
            responseData,
            processedAt: new Date(),
            processingDuration: req.processingStartTime ? Date.now() - req.processingStartTime : 0,
            error: {
              occurred: false
            },
            retryCount: 0
          });

          console.log(`✅ Idempotency key stored for future retry detection`, {
            key: idempotencyKey.substring(0, 16) + '...',
            status: res.statusCode
          });
        } else {
          // Still store failed responses, but mark with error
          await IdempotencyKey.create({
            idempotencyKey,
            requestId: req.requestId,
            webhookType: req.body?.event || 'unknown',
            responseStatus: res.statusCode,
            responseData,
            processedAt: new Date(),
            error: {
              occurred: true,
              message: responseData?.error || responseData?.message || 'Request failed'
            }
          });
        }
      } catch (error) {
        console.error('Error storing idempotency key:', error.message);
        // Don't fail the response, just log the issue
      }

      // Call original send with data
      return originalSend.call(this, data);
    };

    // Record processing start time
    req.processingStartTime = Date.now();

    next();
  } catch (error) {
    console.error('Error in idempotency middleware:', error.message);
    // Don't fail the request, continue processing
    next();
  }
};

/**
 * Check if request is being retried (idempotent)
 * 
 * Use this in handlers to detect if this is a retry of a previous request
 * 
 * @example
 * export async function handleWebhook(req, res) {
 *   if (isRetryRequest(req)) {
 *     console.log('This is a retry - be extra careful!');
 *   }
 * }
 */
export const isRetryRequest = (req) => {
  return req.isIdempotentRequest === true && 
         (req.query?.retry === 'true' || req.headers?.['x-retry-count']);
};

/**
 * Get idempotency status
 * 
 * Returns information about idempotency key and caching status
 * 
 * @example
 * const status = getIdempotencyStatus(req);
 * console.log(status.isCached, status.key, status.retryCount);
 */
export const getIdempotencyStatus = (req) => {
  return {
    key: req.idempotencyKey || null,
    isCached: req.body?.cached === true,
    requestId: req.requestId || null,
    isIdempotentRequest: req.isIdempotentRequest || false
  };
};

/**
 * Cleanup expired idempotency keys (optional)
 * 
 * MongoDB will automatically clean up expired keys based on TTL index,
 * but you can manually trigger cleanup if needed.
 * 
 * @example
 * // Run periodically (e.g., every 24 hours)
 * await cleanupExpiredIdempotencyKeys();
 */
export const cleanupExpiredIdempotencyKeys = async () => {
  try {
    const result = await IdempotencyKey.deleteMany({
      expiresAt: { $lt: new Date() }
    });

    console.log(`🧹 Cleaned up ${result.deletedCount} expired idempotency keys`);
    return result.deletedCount;
  } catch (error) {
    console.error('Error cleaning up idempotency keys:', error.message);
    return 0;
  }
};

/**
 * Get idempotency statistics (for monitoring)
 * 
 * @example
 * const stats = await getIdempotencyStats();
 * console.log(`Total keys: ${stats.totalKeys}, Retries: ${stats.totalRetries}`);
 */
export const getIdempotencyStats = async () => {
  try {
    const stats = await IdempotencyKey.aggregate([
      {
        $group: {
          _id: null,
          totalKeys: { $sum: 1 },
          totalRetries: { $sum: '$retryCount' },
          errorCount: {
            $sum: {
              $cond: [{ $eq: ['$error.occurred', true] }, 1, 0]
            }
          },
          averageRetries: { $avg: '$retryCount' }
        }
      }
    ]);

    return stats[0] || {
      totalKeys: 0,
      totalRetries: 0,
      errorCount: 0,
      averageRetries: 0
    };
  } catch (error) {
    console.error('Error fetching idempotency stats:', error.message);
    return null;
  }
};

export default {
  idempotencyMiddleware,
  isRetryRequest,
  getIdempotencyStatus,
  cleanupExpiredIdempotencyKeys,
  getIdempotencyStats
};
