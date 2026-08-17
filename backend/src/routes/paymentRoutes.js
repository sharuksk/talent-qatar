import express from 'express';
import { protectedRoute } from '../middleware/protectRoute.js';
import { hmacVerificationMiddleware, requireValidSignature, logSignatureInfo } from '../middleware/hmacVerification.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import {
  createPaymentOrder,
  verifyPayment,
  getPaymentStatus,
  refundPayment,
  getPaymentHistory
} from '../controllers/paymentController.js';
import {
  handleWebhook,
  webhookHealth
} from '../controllers/webhookController.js';

const router = express.Router();

/**
 * Payment Routes
 * 
 * Protected routes (require authentication):
 * - POST /create-order     - Create payment order
 * - POST /verify           - Verify payment signature
 * - GET  /:orderId         - Get payment status
 * - POST /refund           - Refund payment
 * - GET  /history          - Get payment history
 * 
 * Webhook routes (unprotected, signature-verified):
 * - POST /webhook          - Handle incoming webhooks
 * - GET  /webhook/health   - Health check
 */

// ============================================
// PROTECTED ROUTES (User authentication required)
// ============================================

/**
 * POST /api/payment/create-order
 * 
 * Create a Razorpay payment order
 * 
 * Required headers:
 * - Authorization: Bearer <token>
 * 
 * Request body:
 * {
 *   "sessionId": "64a5f3e2c1d2e3f4g5h6i7j8",
 *   "amount": 50000,
 *   "description": "Mock Interview Session - Algorithm"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "orderId": "order_123abc456",
 *   "amount": 50000,
 *   "currency": "INR",
 *   "paymentId": "64a5f3e2c1d2e3f4g5h6i7j8"
 * }
 * 
 * Sandbox Test:
 * curl -X POST http://localhost:3001/api/payment/create-order \
 *   -H "Authorization: Bearer <token>" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "sessionId": "64a5f3e2c1d2e3f4g5h6i7j8",
 *     "amount": 50000,
 *     "description": "Test Payment"
 *   }'
 */
router.post('/create-order', protectedRoute, createPaymentOrder);

/**
 * POST /api/payment/verify
 * 
 * Verify payment after successful transaction
 * 
 * Request body:
 * {
 *   "orderId": "order_123abc456",
 *   "paymentId": "pay_456def789",
 *   "signature": "signature_hash_from_razorpay"
 * }
 */
router.post('/verify', protectedRoute, verifyPayment);

/**
 * GET /api/payment/:orderId
 * 
 * Get payment status by order ID
 */
router.get('/:orderId', protectedRoute, getPaymentStatus);

/**
 * POST /api/payment/refund
 * 
 * Refund a captured payment
 * 
 * Request body:
 * {
 *   "paymentId": "pay_456def789",
 *   "reason": "customer_request",
 *   "amount": 50000  // optional, for partial refund
 * }
 */
router.post('/refund', protectedRoute, refundPayment);

/**
 * GET /api/payment/history
 * 
 * Get user's payment history with pagination
 * 
 * Query parameters:
 * - limit: Number of records per page (default: 20)
 * - skip: Number of records to skip (default: 0)
 */
router.get('/history', protectedRoute, getPaymentHistory);

// ============================================
// WEBHOOK ROUTES (Razorpay signature verification required)
// ============================================

/**
 * POST /api/payment/webhook
 * 
 * Handle incoming Razorpay webhook events
 * 
 * Webhook security layers:
 * 1. hmacVerificationMiddleware  - Verifies HMAC signature
 * 2. idempotencyMiddleware       - Prevents duplicate processing
 * 3. logSignatureInfo            - Logs all webhook requests
 * 
 * Supported events:
 * - payment.captured    - Payment successfully completed
 * - payment.authorized  - Payment authorized (awaiting capture)
 * - payment.failed      - Payment failed or declined
 * - payment.dispute.created - Chargeback/dispute initiated
 * - refund.created      - Refund successfully processed
 * - refund.failed       - Refund failed
 * 
 * Request format (from Razorpay):
 * {
 *   "id": "webhook_123abc",
 *   "event": "payment.captured",
 *   "created_at": 1692345678,
 *   "payload": {
 *     "id": "pay_123abc456",
 *     "order_id": "order_789def",
 *     "amount": 50000,
 *     "status": "captured"
 *   }
 * }
 * 
 * Headers (required):
 * - X-Razorpay-Signature: HMAC-SHA256 signature
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Webhook event 'payment.captured' processed successfully",
 *   "webhookId": "webhook_123abc"
 * }
 * 
 * Idempotency:
 * - If webhook is retried with same payload, cached response is returned
 * - No duplicate payment processing occurs
 * - Key is generated from: payload + signature
 * 
 * Sandbox Testing (using curl):
 * Note: In development mode, signature verification is skipped.
 * 
 * curl -X POST http://localhost:3001/api/payment/webhook \
 *   -H "Content-Type: application/json" \
 *   -H "X-Razorpay-Signature: placeholder_signature" \
 *   -d '{
 *     "id": "webhook_test_123",
 *     "event": "payment.captured",
 *     "created_at": '$(date +%s)',
 *     "payload": {
 *       "id": "pay_test_123",
 *       "order_id": "order_test_123",
 *       "amount": 50000,
 *       "status": "captured"
 *     }
 *   }'
 */
router.post(
  '/webhook',
  hmacVerificationMiddleware,      // Verify HMAC signature
  idempotencyMiddleware,             // Check for duplicates
  logSignatureInfo,                  // Log all webhook requests
  handleWebhook                      // Process webhook
);

/**
 * GET /api/payment/webhook/health
 * 
 * Health check endpoint for webhook receiver
 * 
 * Returns:
 * {
 *   "success": true,
 *   "service": "Razorpay Webhook Receiver",
 *   "status": "operational",
 *   "statistics": {
 *     "totalWebhooks": 42,
 *     "failedWebhooks": 1,
 *     "totalRetries": 5
 *   }
 * }
 */
router.get('/webhook/health', webhookHealth);

export default router;
