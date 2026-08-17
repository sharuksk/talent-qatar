import crypto from 'crypto';
import { ENV } from './env.js';
import { generateSignature } from './hmacUtils.js';

/**
 * Razorpay Sandbox Payment Service
 * 
 * Handles all communication with Razorpay in sandbox mode for testing.
 * Razorpay provides a FREE sandbox environment perfect for development/testing.
 * 
 * Sandbox Documentation: https://razorpay.com/docs/payments/payments/test-a-payment/
 * Test Cards Available:
 *   - Success: 4111 1111 1111 1111 (any future expiry, any CVV)
 *   - Failure: 4111 1111 1111 1112 (any future expiry, any CVV)
 *   - Auth/Capture: 5555 5555 5555 4444 (any future expiry, any CVV)
 * 
 * API Reference: https://razorpay.com/docs/api/
 */

class RazorpayService {
  constructor() {
    // PLACEHOLDER: Replace with actual Razorpay credentials
    // These will be injected via environment variables in production
    this.apiKey = process.env.RAZORPAY_KEY_ID || 'PLACEHOLDER_KEY_ID';
    this.apiSecret = process.env.RAZORPAY_KEY_SECRET || 'PLACEHOLDER_KEY_SECRET';
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'PLACEHOLDER_WEBHOOK_SECRET';
    
    // Razorpay Sandbox API endpoint (for testing)
    this.baseURL = 'https://api.razorpay.com/v1';
    
    // Check if using placeholders
    if (this.apiKey.includes('PLACEHOLDER')) {
      console.warn('⚠️  RAZORPAY_KEY_ID not configured. Using PLACEHOLDER.');
      console.warn('📝 To set up: Get credentials from https://dashboard.razorpay.com/app/settings/api-tokens');
      console.warn('🔑 In sandbox mode, use test credentials. Switch to live credentials in production.');
    }
  }

  /**
   * Create an order in Razorpay
   * 
   * Orders are created first, then paid using a payment link or payment form.
   * This returns an orderId that must be sent to the frontend for payment.
   * 
   * @param {Object} options - Order creation parameters
   * @returns {Promise<Object>} Order details from Razorpay
   * 
   * @example
   * const order = await paymentService.createOrder({
   *   amount: 50000, // in paise (₹500)
   *   currency: 'INR',
   *   description: 'Mock Interview Session - Algorithm',
   *   notes: { sessionId: '123abc' }
   * });
   */
  async createOrder(options) {
    try {
      const {
        amount,
        currency = 'INR',
        description = 'Payment for Talent Qatar Platform',
        notes = {},
        customerId = null,
        email = null,
        phone = null,
        partial_payment = false,
        first_min_partial_amount = null
      } = options;

      // Validate amount
      if (!amount || amount <= 0) {
        throw new Error('Invalid amount. Must be greater than 0.');
      }

      // Prepare order payload
      const orderPayload = {
        amount: Math.round(amount), // Convert to paise (integers only)
        currency,
        receipt: `receipt_${Date.now()}`,
        description,
        notes: {
          ...notes,
          created_via: 'talent_qatar_platform'
        },
        partial_payment: partial_payment ? 1 : 0,
        timeout: 900 // 15 minutes timeout
      };

      // Optional: Add customer details
      if (email || phone) {
        orderPayload.customer_notify = 1;
        if (email) orderPayload.email = email;
        if (phone) orderPayload.phone = phone;
      }

      if (first_min_partial_amount) {
        orderPayload.first_min_partial_amount = first_min_partial_amount;
      }

      console.log(`📦 Creating Razorpay order: ₹${amount / 100} ${currency}`);

      // Make API call to Razorpay
      const response = await this._makeRequest('POST', '/orders', orderPayload);

      console.log(`✅ Order created: ${response.id}`);

      return {
        success: true,
        orderId: response.id,
        amount: response.amount,
        currency: response.currency,
        status: response.status,
        receipt: response.receipt,
        createdAt: new Date(response.created_at * 1000),
        // Include details needed for frontend payment form
        details: response
      };
    } catch (error) {
      console.error('❌ Error creating order:', error.message);
      throw {
        success: false,
        error: error.message || 'Failed to create order',
        details: error.response?.data || {}
      };
    }
  }

  /**
   * Fetch order details from Razorpay
   * 
   * Retrieves current status and details of an order
   * 
   * @param {string} orderId - Razorpay Order ID
   * @returns {Promise<Object>} Order details
   */
  async getOrder(orderId) {
    try {
      if (!orderId) {
        throw new Error('Order ID is required');
      }

      const response = await this._makeRequest('GET', `/orders/${orderId}`);

      return {
        success: true,
        orderId: response.id,
        amount: response.amount,
        currency: response.currency,
        status: response.status,
        amountPaid: response.amount_paid,
        amountDue: response.amount_due,
        payments: response.payments,
        createdAt: new Date(response.created_at * 1000),
        details: response
      };
    } catch (error) {
      console.error('❌ Error fetching order:', error.message);
      throw {
        success: false,
        error: error.message || 'Failed to fetch order'
      };
    }
  }

  /**
   * Create a payment link (alternative to payment form)
   * 
   * Payment links are shareable links that customers can use to pay.
   * More user-friendly than traditional payment forms.
   * 
   * @param {Object} options - Payment link options
   * @returns {Promise<Object>} Payment link details
   * 
   * @example
   * const link = await paymentService.createPaymentLink({
   *   amount: 50000,
   *   description: 'Mock Interview Session',
   *   customer: { name: 'John', email: 'john@example.com' }
   * });
   * // Return link.short_url to customer
   */
  async createPaymentLink(options) {
    try {
      const {
        amount,
        currency = 'INR',
        description = 'Payment for Talent Qatar Platform',
        customerId = null,
        customer = {},
        notes = {},
        notifyEmail = true,
        notifySms = false,
        expiresBy = null,
        callbackUrl = null,
        callbackMethod = 'get'
      } = options;

      if (!amount || amount <= 0) {
        throw new Error('Invalid amount');
      }

      const payload = {
        amount: Math.round(amount),
        currency,
        description,
        customer,
        notes: {
          ...notes,
          created_via: 'talent_qatar_platform'
        },
        notify: {
          email: notifyEmail,
          sms: notifySms
        },
        callback_url: callbackUrl || `${process.env.API_URL || 'http://localhost:3001'}/api/payment/callback`,
        callback_method: callbackMethod
      };

      if (expiresBy) {
        payload.expire_by = Math.floor(expiresBy.getTime() / 1000);
      }

      console.log(`🔗 Creating payment link: ₹${amount / 100} ${currency}`);

      const response = await this._makeRequest('POST', '/payment_links', payload);

      return {
        success: true,
        paymentLinkId: response.id,
        shortUrl: response.short_url,
        amount: response.amount,
        currency: response.currency,
        status: response.status,
        expiresBy: response.expire_by ? new Date(response.expire_by * 1000) : null,
        createdAt: new Date(response.created_at * 1000),
        details: response
      };
    } catch (error) {
      console.error('❌ Error creating payment link:', error.message);
      throw {
        success: false,
        error: error.message || 'Failed to create payment link'
      };
    }
  }

  /**
   * Fetch payment details
   * 
   * @param {string} paymentId - Razorpay Payment ID
   * @returns {Promise<Object>} Payment details
   */
  async getPayment(paymentId) {
    try {
      if (!paymentId) {
        throw new Error('Payment ID is required');
      }

      const response = await this._makeRequest('GET', `/payments/${paymentId}`);

      return {
        success: true,
        paymentId: response.id,
        orderId: response.order_id,
        amount: response.amount,
        currency: response.currency,
        status: response.status,
        method: response.method,
        email: response.email,
        vpa: response.vpa,
        fee: response.fee,
        tax: response.tax,
        createdAt: new Date(response.created_at * 1000),
        details: response
      };
    } catch (error) {
      console.error('❌ Error fetching payment:', error.message);
      throw {
        success: false,
        error: error.message || 'Failed to fetch payment'
      };
    }
  }

  /**
   * Capture a payment (if authorized but not captured)
   * 
   * @param {string} paymentId - Razorpay Payment ID
   * @param {number} amount - Amount to capture in paise
   * @returns {Promise<Object>} Capture result
   */
  async capturePayment(paymentId, amount) {
    try {
      if (!paymentId) {
        throw new Error('Payment ID is required');
      }

      const payload = {
        amount: Math.round(amount)
      };

      console.log(`💰 Capturing payment ${paymentId}: ₹${amount / 100}`);

      const response = await this._makeRequest('POST', `/payments/${paymentId}/capture`, payload);

      return {
        success: true,
        paymentId: response.id,
        status: response.status,
        amount: response.amount,
        details: response
      };
    } catch (error) {
      console.error('❌ Error capturing payment:', error.message);
      throw {
        success: false,
        error: error.message || 'Failed to capture payment'
      };
    }
  }

  /**
   * Create a refund
   * 
   * @param {string} paymentId - Razorpay Payment ID
   * @param {Object} options - Refund options
   * @returns {Promise<Object>} Refund details
   * 
   * @example
   * const refund = await paymentService.createRefund('pay_123', {
   *   amount: 50000, // Optional: partial refund
   *   reason: 'customer_request',
   *   notes: { reason: 'Session cancelled' }
   * });
   */
  async createRefund(paymentId, options = {}) {
    try {
      if (!paymentId) {
        throw new Error('Payment ID is required');
      }

      const { amount, reason = 'customer_request', notes = {} } = options;

      const payload = {
        reason,
        notes: {
          ...notes,
          created_via: 'talent_qatar_platform'
        }
      };

      if (amount) {
        payload.amount = Math.round(amount);
      }

      console.log(`🔄 Creating refund for ${paymentId}${amount ? `: ₹${amount / 100}` : ''}`);

      const response = await this._makeRequest('POST', `/payments/${paymentId}/refund`, payload);

      return {
        success: true,
        refundId: response.id,
        amount: response.amount,
        currency: response.currency,
        status: response.status,
        reason: response.reason,
        createdAt: new Date(response.created_at * 1000),
        details: response
      };
    } catch (error) {
      console.error('❌ Error creating refund:', error.message);
      throw {
        success: false,
        error: error.message || 'Failed to create refund'
      };
    }
  }

  /**
   * Internal method: Make HTTP request to Razorpay API
   * 
   * Handles authentication and error responses
   * 
   * @private
   */
  async _makeRequest(method, endpoint, payload = null) {
    try {
      const url = `${this.baseURL}${endpoint}`;
      
      // Create Basic Auth header (Razorpay requires Basic Auth)
      const credentials = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');

      const options = {
        method,
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
          'User-Agent': 'TalentQatar/1.0'
        }
      };

      let body = null;
      if (payload && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        body = JSON.stringify(payload);
        options.body = body;
      }

      const response = await fetch(url, options);

      const data = await response.json();

      if (!response.ok) {
        const error = new Error(data.error?.description || 'API request failed');
        error.response = { status: response.status, data };
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Verify webhook signature
   * 
   * Call this to verify that a webhook actually came from Razorpay
   * 
   * @param {string} signature - Signature from X-Razorpay-Signature header
   * @param {Object} payload - Webhook payload
   * @param {string} secret - Razorpay webhook secret
   * @returns {boolean} True if signature is valid
   */
  verifyWebhookSignature(signature, payload, secret = this.webhookSecret) {
    try {
      const crypto = require('crypto');
      
      const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const hash = crypto
        .createHmac('sha256', secret || 'PLACEHOLDER_WEBHOOK_SECRET')
        .update(message)
        .digest('hex');

      return hash === signature;
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }
}

// Export singleton instance
export const paymentService = new RazorpayService();

export default RazorpayService;
