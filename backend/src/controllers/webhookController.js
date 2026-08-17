import Payment from '../models/Payment.js';
import IdempotencyKey from '../models/IdempotencyKey.js';
import { getIdempotencyStatus } from '../middleware/idempotency.js';

/**
 * Webhook Controller
 * 
 * Handles incoming webhooks from Razorpay payment service.
 * Webhooks are sent for payment status updates: success, failure, refund, etc.
 * 
 * Webhook Security:
 * 1. HMAC signature verification (checked by middleware)
 * 2. Idempotency key tracking (no duplicate processing)
 * 3. Request validation and logging
 * 
 * Webhook Events Handled:
 * - payment.captured: Payment successfully completed
 * - payment.authorized: Payment authorized (awaiting capture)
 * - payment.failed: Payment failed or declined
 * - payment.dispute.created: Chargeback or dispute initiated
 * - refund.created: Refund initiated
 * - refund.failed: Refund failed
 */

/**
 * POST /api/payment/webhook
 * 
 * Main webhook handler for Razorpay events
 * 
 * Webhook signature verification is done by hmacVerificationMiddleware
 * Idempotency checking is done by idempotencyMiddleware
 * 
 * This handler just needs to process the event and update the database
 */
export async function handleWebhook(req, res) {
  try {
    const { event, payload } = req.body;
    const webhookId = req.body.id;

    console.log(`📨 Processing webhook event: ${event} (${webhookId})`);

    // Log idempotency status
    const idempotencyStatus = getIdempotencyStatus(req);
    if (idempotencyStatus.isCached) {
      console.log('♻️  This webhook was already processed (cached response)');
    }

    // Route to appropriate handler based on event type
    let result;
    switch (event) {
      case 'payment.captured':
        result = await handlePaymentCaptured(payload);
        break;

      case 'payment.authorized':
        result = await handlePaymentAuthorized(payload);
        break;

      case 'payment.failed':
        result = await handlePaymentFailed(payload);
        break;

      case 'payment.dispute.created':
        result = await handlePaymentDispute(payload);
        break;

      case 'refund.created':
        result = await handleRefundCreated(payload);
        break;

      case 'refund.failed':
        result = await handleRefundFailed(payload);
        break;

      default:
        console.warn(`⚠️  Unknown webhook event: ${event}`);
        result = {
          success: true,
          message: `Event type '${event}' acknowledged but not processed`
        };
    }

    if (!result.success) {
      console.error(`❌ Error processing webhook:`, result.error);
      return res.status(400).json({
        error: 'Webhook processing failed',
        message: result.error,
        event
      });
    }

    console.log(`✅ Webhook processed successfully`, {
      event,
      webhookId,
      paymentId: result.paymentId
    });

    return res.status(200).json({
      success: true,
      message: `Webhook event '${event}' processed successfully`,
      webhookId,
      result
    });
  } catch (error) {
    console.error('❌ Error in webhook handler:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'Failed to process webhook',
      event: req.body?.event
    });
  }
}

/**
 * Handle payment.captured event
 * 
 * Triggered when payment is successfully captured (completed)
 */
async function handlePaymentCaptured(payload) {
  try {
    const { id: paymentId, order_id: orderId, amount, entity } = payload;

    console.log(`💰 Payment captured: ${paymentId} - ₹${amount / 100}`);

    // Find payment record
    const payment = await Payment.findOne({
      $or: [
        { paymentId },
        { orderId }
      ]
    });

    if (!payment) {
      console.warn(`⚠️  Payment record not found for ${paymentId || orderId}`);
      return {
        success: false,
        error: `Payment record not found for ${paymentId}`
      };
    }

    // Update payment status
    payment.paymentId = paymentId;
    payment.status = 'captured';
    payment.razorpayResponse = {
      ...payment.razorpayResponse,
      captured: {
        paymentId,
        amount,
        status: entity,
        capturedAt: new Date()
      }
    };

    await payment.save();

    console.log(`✅ Payment marked as captured`, {
      paymentId,
      sessionId: payment.sessionId,
      amount: `₹${amount / 100}`
    });

    return {
      success: true,
      paymentId,
      message: 'Payment captured successfully'
    };
  } catch (error) {
    console.error('Error handling payment captured:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle payment.authorized event
 * 
 * Triggered when payment is authorized (funds reserved, not yet captured)
 */
async function handlePaymentAuthorized(payload) {
  try {
    const { id: paymentId, order_id: orderId, amount } = payload;

    console.log(`🔓 Payment authorized: ${paymentId} - ₹${amount / 100}`);

    const payment = await Payment.findOne({
      $or: [
        { paymentId },
        { orderId }
      ]
    });

    if (!payment) {
      return {
        success: false,
        error: `Payment record not found for ${paymentId}`
      };
    }

    payment.paymentId = paymentId;
    payment.status = 'authorized';
    payment.razorpayResponse = {
      ...payment.razorpayResponse,
      authorized: {
        paymentId,
        amount,
        authorizedAt: new Date()
      }
    };

    await payment.save();

    return {
      success: true,
      paymentId,
      message: 'Payment authorized'
    };
  } catch (error) {
    console.error('Error handling payment authorized:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle payment.failed event
 * 
 * Triggered when payment fails or is declined
 */
async function handlePaymentFailed(payload) {
  try {
    const { id: paymentId, order_id: orderId, error } = payload;

    console.error(`❌ Payment failed: ${paymentId}`, error);

    const payment = await Payment.findOne({
      $or: [
        { paymentId },
        { orderId }
      ]
    });

    if (!payment) {
      return {
        success: false,
        error: `Payment record not found for ${paymentId}`
      };
    }

    payment.paymentId = paymentId;
    payment.status = 'failed';
    payment.failureReason = {
      code: error?.code,
      description: error?.description,
      source: error?.source,
      step: error?.step,
      reason: error?.reason
    };
    payment.razorpayResponse = {
      ...payment.razorpayResponse,
      failed: {
        paymentId,
        error,
        failedAt: new Date()
      }
    };

    await payment.save();

    console.log(`📝 Payment failure recorded`, {
      paymentId,
      errorCode: error?.code,
      errorReason: error?.reason
    });

    return {
      success: true,
      paymentId,
      message: 'Payment failure recorded'
    };
  } catch (error) {
    console.error('Error handling payment failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle payment.dispute.created event
 * 
 * Triggered when a chargeback or dispute is initiated by customer
 */
async function handlePaymentDispute(payload) {
  try {
    const { id: disputeId, payment_id: paymentId, amount, reason } = payload;

    console.error(`⚠️  Payment dispute created: ${disputeId} for ${paymentId}`, reason);

    const payment = await Payment.findOne({ paymentId });

    if (!payment) {
      return {
        success: false,
        error: `Payment record not found for ${paymentId}`
      };
    }

    payment.status = 'disputed';
    payment.razorpayResponse = {
      ...payment.razorpayResponse,
      dispute: {
        disputeId,
        amount,
        reason,
        createdAt: new Date()
      }
    };

    await payment.save();

    // TODO: Notify admin/support team about dispute
    console.log(`📧 Dispute notification should be sent to support`);

    return {
      success: true,
      paymentId,
      message: 'Payment dispute recorded'
    };
  } catch (error) {
    console.error('Error handling payment dispute:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle refund.created event
 * 
 * Triggered when refund is successfully processed
 */
async function handleRefundCreated(payload) {
  try {
    const { id: refundId, payment_id: paymentId, amount, status } = payload;

    console.log(`🔄 Refund created: ${refundId} for ${paymentId} - ₹${amount / 100}`);

    const payment = await Payment.findOne({ paymentId });

    if (!payment) {
      return {
        success: false,
        error: `Payment record not found for ${paymentId}`
      };
    }

    payment.refundId = refundId;
    payment.refundAmount = amount;
    payment.refundStatus = 'processed';
    payment.status = 'refunded';
    payment.razorpayResponse = {
      ...payment.razorpayResponse,
      refund: {
        refundId,
        amount,
        status,
        createdAt: new Date()
      }
    };

    await payment.save();

    console.log(`✅ Refund recorded`, {
      refundId,
      paymentId,
      amount: `₹${amount / 100}`
    });

    return {
      success: true,
      paymentId,
      refundId,
      message: 'Refund recorded successfully'
    };
  } catch (error) {
    console.error('Error handling refund created:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle refund.failed event
 * 
 * Triggered when refund processing fails
 */
async function handleRefundFailed(payload) {
  try {
    const { id: refundId, payment_id: paymentId, amount, error } = payload;

    console.error(`❌ Refund failed: ${refundId} for ${paymentId}`, error);

    const payment = await Payment.findOne({ paymentId });

    if (!payment) {
      return {
        success: false,
        error: `Payment record not found for ${paymentId}`
      };
    }

    payment.refundStatus = 'failed';
    payment.razorpayResponse = {
      ...payment.razorpayResponse,
      refundFailed: {
        refundId,
        amount,
        error,
        failedAt: new Date()
      }
    };

    await payment.save();

    // TODO: Notify user and support team about refund failure
    console.log(`📧 Refund failure notification should be sent`);

    return {
      success: true,
      paymentId,
      refundId,
      message: 'Refund failure recorded'
    };
  } catch (error) {
    console.error('Error handling refund failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Health check endpoint for webhook
 * 
 * GET /api/payment/webhook/health
 * 
 * Verifies webhook receiver is operational
 */
export async function webhookHealth(req, res) {
  try {
    const stats = await IdempotencyKey.aggregate([
      {
        $group: {
          _id: null,
          totalWebhooks: { $sum: 1 },
          failedWebhooks: {
            $sum: {
              $cond: [{ $eq: ['$error.occurred', true] }, 1, 0]
            }
          },
          totalRetries: { $sum: '$retryCount' }
        }
      }
    ]);

    return res.status(200).json({
      success: true,
      service: 'Razorpay Webhook Receiver',
      status: 'operational',
      statistics: stats[0] || {
        totalWebhooks: 0,
        failedWebhooks: 0,
        totalRetries: 0
      },
      timestamp: new Date()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      service: 'Razorpay Webhook Receiver',
      status: 'error',
      message: error.message
    });
  }
}

export default {
  handleWebhook,
  webhookHealth
};
