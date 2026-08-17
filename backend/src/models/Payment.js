import mongoose from 'mongoose';

/**
 * Payment Schema - Tracks all payment transactions
 * Integrates with Razorpay for sandbox payment processing
 */
const paymentSchema = new mongoose.Schema({
  // Payment Identification
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    description: 'Razorpay Order ID'
  },
  paymentId: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
    description: 'Razorpay Payment ID (assigned after successful payment)'
  },
  
  // User & Session References
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  
  // Payment Details
  amount: {
    type: Number,
    required: true,
    description: 'Amount in paise (smallest currency unit for INR)'
  },
  currency: {
    type: String,
    default: 'INR',
    description: 'Currency code'
  },
  description: {
    type: String,
    required: true,
    description: 'Payment description (e.g., "Mock Interview Session - Algorithm")'
  },
  
  // Payment Status Tracking
  status: {
    type: String,
    enum: ['created', 'pending', 'authorized', 'captured', 'failed', 'refunded', 'cancelled'],
    default: 'created',
    index: true,
    description: 'Current payment status'
  },
  
  // Razorpay Response Data (stored for audit trail)
  razorpayResponse: {
    receipt: String,
    notes: mongoose.Schema.Types.Mixed,
    shortUrl: String,
    createdAt: Date
  },
  
  // Failure Information
  failureReason: {
    code: String,
    description: String,
    source: String,
    step: String,
    reason: String
  },
  
  // Refund Tracking
  refundId: {
    type: String,
    unique: true,
    sparse: true
  },
  refundAmount: Number,
  refundReason: String,
  refundStatus: {
    type: String,
    enum: ['pending', 'processed', 'failed'],
    sparse: true
  },
  
  // Metadata
  metadata: mongoose.Schema.Types.Mixed,
  
  // Audit Trail
  ipAddress: String,
  userAgent: String,
  
}, { timestamps: true });

// Index for querying by user and date
paymentSchema.index({ userId: 1, createdAt: -1 });
// Index for payment status reporting
paymentSchema.index({ status: 1, createdAt: -1 });

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
