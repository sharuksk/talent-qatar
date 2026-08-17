import mongoose from 'mongoose';

/**
 * IdempotencyKey Schema - Prevents duplicate webhook processing
 * 
 * When webhooks are retried (e.g., network failures), this ensures
 * the same webhook is not processed multiple times.
 * 
 * Implementation:
 * 1. Generate idempotency key from webhook signature + request body
 * 2. Check if key exists in database
 * 3. If exists, return cached response (no re-processing)
 * 4. If new, process webhook and store result
 */
const idempotencyKeySchema = new mongoose.Schema({
  // Unique identifier for the request
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true,
    description: 'UUID or hash generated from webhook signature and payload'
  },
  
  // Request Information
  requestId: {
    type: String,
    required: true,
    index: true,
    description: 'Webhook request ID from payment provider'
  },
  
  // Resource References
  paymentId: {
    type: String,
    index: true,
    description: 'Related payment ID (if applicable)'
  },
  
  webhookType: {
    type: String,
    required: true,
    description: 'Type of webhook (e.g., payment.captured, refund.processed)'
  },
  
  // Request Metadata
  requestSignature: {
    type: String,
    description: 'HMAC signature for verification'
  },
  
  requestPayload: {
    type: mongoose.Schema.Types.Mixed,
    description: 'Complete webhook payload (for debugging)'
  },
  
  // Response Information
  responseStatus: {
    type: Number,
    description: 'HTTP status code of response'
  },
  
  responseData: {
    type: mongoose.Schema.Types.Mixed,
    description: 'Response sent back to webhook provider'
  },
  
  // Processing Details
  processedAt: {
    type: Date,
    description: 'When the webhook was first processed'
  },
  
  processingDuration: {
    type: Number,
    description: 'Time taken to process in milliseconds'
  },
  
  error: {
    occurred: Boolean,
    message: String,
    stack: String,
    description: 'Error details if processing failed'
  },
  
  // Retry Information
  retryCount: {
    type: Number,
    default: 0,
    description: 'Number of times this idempotency key was requested'
  },
  
  retries: [{
    timestamp: Date,
    ipAddress: String,
    userAgent: String
  }],
  
  // Expiration (garbage collection)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    index: { expireAfterSeconds: 0 },
    description: 'TTL for automatic cleanup'
  }
  
}, { timestamps: true });

// Compound index for querying by webhook type and payment
idempotencyKeySchema.index({ webhookType: 1, paymentId: 1 });
// Index for retry tracking
idempotencyKeySchema.index({ requestId: 1, createdAt: -1 });

const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);

export default IdempotencyKey;
