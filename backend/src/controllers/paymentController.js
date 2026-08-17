import Payment from '../models/Payment.js';
import Session from '../models/Session.js';
import { paymentService } from '../lib/paymentService.js';
import { generateIdempotencyKey } from '../lib/hmacUtils.js';

/**
 * Payment Controller
 * 
 * Handles all payment-related API endpoints:
 * 1. Creating payment orders (initiate payment)
 * 2. Processing webhook callbacks (payment status updates)
 * 3. Handling payment cancellations and refunds
 * 4. Querying payment history
 */

/**
 * POST /api/payment/create-order
 * 
 * Create a Razorpay order for a session payment.
 * This is called by the frontend before payment form is shown.
 * 
 * Request body:
 * {
 *   sessionId: "64abc123...",
 *   amount: 50000,  // in paise (₹500)
 *   description: "Mock Interview Session - Algorithm"
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   orderId: "order_123abc",
 *   amount: 50000,
 *   currency: "INR"
 * }
 */
export async function createPaymentOrder(req, res) {
  try {
    const { sessionId, amount, description } = req.body;
    const userId = req.user._id;

    // Validation
    if (!sessionId || !amount || amount <= 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'sessionId and amount are required, amount must be > 0'
      });
    }

    // Verify session exists and belongs to user
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: `Session ${sessionId} does not exist`
      });
    }

    // Check if user is host (session creator)
    if (session.host.toString() !== userId.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only session host can create payment'
      });
    }

    // Check if payment already exists for this session
    const existingPayment = await Payment.findOne({
      sessionId,
      status: { $in: ['created', 'pending', 'authorized', 'captured'] }
    });

    if (existingPayment) {
      return res.status(400).json({
        error: 'Payment already pending',
        message: `Payment ${existingPayment.orderId} is already in progress for this session`,
        orderId: existingPayment.orderId,
        amount: existingPayment.amount
      });
    }

    // Create Razorpay order
    const orderResult = await paymentService.createOrder({
      amount: Math.round(amount),
      currency: 'INR',
      description: description || 'Payment for Talent Qatar Platform',
      notes: {
        sessionId: sessionId.toString(),
        userId: userId.toString(),
        userName: req.user.name,
        userEmail: req.user.email
      },
      email: req.user.email,
      phone: req.user.phone || null
    });

    if (!orderResult.success) {
      return res.status(500).json({
        error: 'Payment service error',
        message: 'Failed to create payment order',
        details: orderResult.error
      });
    }

    // Store payment record in database
    const payment = await Payment.create({
      orderId: orderResult.orderId,
      userId,
      sessionId,
      amount: Math.round(amount),
      currency: 'INR',
      description: description || 'Payment for Talent Qatar Platform',
      status: 'created',
      razorpayResponse: {
        receipt: orderResult.details.receipt,
        notes: orderResult.details.notes,
        shortUrl: orderResult.details.short_url,
        createdAt: orderResult.createdAt
      },
      metadata: {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.connection.remoteAddress
      }
    });

    console.log(`✅ Payment order created`, {
      orderId: orderResult.orderId,
      sessionId,
      amount: `₹${amount / 100}`,
      userId: userId.toString()
    });

    return res.status(201).json({
      success: true,
      orderId: orderResult.orderId,
      amount: orderResult.amount,
      currency: orderResult.currency,
      status: orderResult.status,
      paymentId: payment._id,
      message: 'Payment order created. Proceed with payment.'
    });
  } catch (error) {
    console.error('❌ Error creating payment order:', error);
    return res.status(500).json({
      error: 'Server error',
      message: error.message || 'Failed to create payment order'
    });
  }
}

/**
 * POST /api/payment/verify
 * 
 * Verify payment signature after successful payment.
 * This is called after payment is completed on the frontend.
 * 
 * Request body:
 * {
 *   orderId: "order_123abc",
 *   paymentId: "pay_456def",
 *   signature: "signature_hash"
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   message: "Payment verified successfully"
 * }
 */
export async function verifyPayment(req, res) {
  try {
    const { orderId, paymentId, signature } = req.body;
    const userId = req.user._id;

    // Validation
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'orderId, paymentId, and signature are required'
      });
    }

    // Find payment record
    const payment = await Payment.findOne({
      orderId,
      userId
    });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
        message: `No payment found with orderId: ${orderId}`
      });
    }

    // Fetch payment details from Razorpay to verify
    const paymentDetails = await paymentService.getPayment(paymentId);

    if (!paymentDetails.success) {
      return res.status(400).json({
        error: 'Payment verification failed',
        message: 'Could not verify payment with Razorpay',
        details: paymentDetails.error
      });
    }

    // Verify payment status and amount
    if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
      return res.status(400).json({
        error: 'Invalid payment status',
        message: `Payment status is ${paymentDetails.status}, expected captured or authorized`
      });
    }

    if (paymentDetails.amount !== payment.amount) {
      console.error('Amount mismatch!', {
        expected: payment.amount,
        received: paymentDetails.amount
      });
      return res.status(400).json({
        error: 'Amount mismatch',
        message: 'Payment amount does not match order amount'
      });
    }

    // Update payment record
    payment.paymentId = paymentId;
    payment.status = paymentDetails.status === 'captured' ? 'captured' : 'authorized';
    payment.razorpayResponse = {
      ...payment.razorpayResponse,
      paymentDetails: paymentDetails.details
    };

    await payment.save();

    console.log(`✅ Payment verified`, {
      orderId,
      paymentId,
      amount: `₹${payment.amount / 100}`,
      status: payment.status
    });

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      paymentId: payment._id,
      status: payment.status
    });
  } catch (error) {
    console.error('❌ Error verifying payment:', error);
    return res.status(500).json({
      error: 'Server error',
      message: error.message || 'Failed to verify payment'
    });
  }
}

/**
 * GET /api/payment/:orderId
 * 
 * Get payment details by order ID
 */
export async function getPaymentStatus(req, res) {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const payment = await Payment.findOne({ orderId, userId });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found'
      });
    }

    return res.status(200).json({
      success: true,
      orderId: payment.orderId,
      paymentId: payment.paymentId,
      amount: payment.amount,
      status: payment.status,
      description: payment.description,
      createdAt: payment.createdAt
    });
  } catch (error) {
    console.error('❌ Error fetching payment:', error);
    return res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
}

/**
 * POST /api/payment/refund
 * 
 * Refund a payment
 * 
 * Request body:
 * {
 *   paymentId: "pay_456def",
 *   reason: "customer_request",
 *   amount: 50000  // optional, partial refund
 * }
 */
export async function refundPayment(req, res) {
  try {
    const { paymentId, reason = 'customer_request', amount } = req.body;
    const userId = req.user._id;

    if (!paymentId) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'paymentId is required'
      });
    }

    // Find payment record
    const payment = await Payment.findOne({
      paymentId,
      userId
    });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found'
      });
    }

    if (payment.status !== 'captured') {
      return res.status(400).json({
        error: 'Invalid payment status',
        message: `Cannot refund payment with status: ${payment.status}`
      });
    }

    // Create refund via Razorpay
    const refundResult = await paymentService.createRefund(paymentId, {
      amount: amount || payment.amount,
      reason,
      notes: {
        sessionId: payment.sessionId.toString(),
        refundReason: reason
      }
    });

    if (!refundResult.success) {
      return res.status(500).json({
        error: 'Refund failed',
        message: refundResult.error,
        details: refundResult
      });
    }

    // Update payment record
    payment.refundId = refundResult.refundId;
    payment.refundAmount = refundResult.amount;
    payment.refundReason = reason;
    payment.status = 'refunded';

    await payment.save();

    console.log(`✅ Refund processed`, {
      paymentId,
      refundId: refundResult.refundId,
      amount: `₹${refundResult.amount / 100}`
    });

    return res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      refundId: refundResult.refundId,
      amount: refundResult.amount
    });
  } catch (error) {
    console.error('❌ Error processing refund:', error);
    return res.status(500).json({
      error: 'Server error',
      message: error.message || 'Failed to process refund'
    });
  }
}

/**
 * GET /api/payment/history
 * 
 * Get payment history for current user
 */
export async function getPaymentHistory(req, res) {
  try {
    const userId = req.user._id;
    const { limit = 20, skip = 0 } = req.query;

    const payments = await Payment.find({ userId })
      .populate('sessionId', 'problem difficulty status')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Payment.countDocuments({ userId });

    return res.status(200).json({
      success: true,
      payments: payments.map(p => ({
        paymentId: p._id,
        orderId: p.orderId,
        amount: p.amount,
        status: p.status,
        description: p.description,
        session: p.sessionId,
        createdAt: p.createdAt
      })),
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    console.error('❌ Error fetching payment history:', error);
    return res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
}

export default {
  createPaymentOrder,
  verifyPayment,
  getPaymentStatus,
  refundPayment,
  getPaymentHistory
};
