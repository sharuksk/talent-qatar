/**
 * Frontend Payment Integration Guide
 * 
 * Complete implementation examples for integrating Razorpay payment
 * processing into the Talent Qatar frontend (React + Vite)
 */

// ============================================
// 1. SETUP: Add Razorpay Script to HTML
// ============================================

/*
Add to frontend/index.html in <head> section:

<script src="https://checkout.razorpay.com/v1/checkout.js"></script>

This loads the Razorpay payment form library.
*/

// ============================================
// 2. SERVICE: Payment API Client
// ============================================

// File: src/api/payment.js

import axios from './axios'; // Use existing axios instance

/**
 * Create payment order
 * 
 * Called before payment form is shown
 * Reserves the amount on backend
 */
export async function createPaymentOrder(sessionId, amount, description) {
  try {
    const response = await axios.post('/api/payment/create-order', {
      sessionId,
      amount,
      description: description || 'Payment for Talent Qatar Session'
    });

    return {
      success: true,
      orderId: response.data.orderId,
      amount: response.data.amount,
      currency: response.data.currency
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Verify payment after successful transaction
 * 
 * Called after user completes payment in Razorpay form
 * Verifies the payment signature for security
 */
export async function verifyPayment(orderId, paymentId, signature) {
  try {
    const response = await axios.post('/api/payment/verify', {
      orderId,
      paymentId,
      signature
    });

    return {
      success: true,
      message: response.data.message,
      status: response.data.status
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Get payment status
 */
export async function getPaymentStatus(orderId) {
  try {
    const response = await axios.get(`/api/payment/${orderId}`);

    return {
      success: true,
      status: response.data.status,
      amount: response.data.amount,
      createdAt: response.data.createdAt
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Refund a payment
 */
export async function refundPayment(paymentId, reason = 'customer_request', amount = null) {
  try {
    const response = await axios.post('/api/payment/refund', {
      paymentId,
      reason,
      ...(amount && { amount })
    });

    return {
      success: true,
      refundId: response.data.refundId,
      amount: response.data.amount
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Get payment history
 */
export async function getPaymentHistory(limit = 20, skip = 0) {
  try {
    const response = await axios.get('/api/payment/history', {
      params: { limit, skip }
    });

    return {
      success: true,
      payments: response.data.payments,
      total: response.data.total
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// ============================================
// 3. HOOK: usePayment Hook
// ============================================

// File: src/hooks/usePayment.js

import { useState, useCallback } from 'react';
import {
  createPaymentOrder,
  verifyPayment,
  getPaymentStatus,
  refundPayment,
  getPaymentHistory
} from '../api/payment';

/**
 * Custom hook for payment operations
 * 
 * Manages:
 * - Payment state (loading, error, success)
 * - Payment processing flow
 * - Error handling and user feedback
 */
export function usePayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const clearState = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  /**
   * Initiate payment
   * 
   * Opens Razorpay payment form
   */
  const initiatePayment = useCallback(
    async (sessionId, amount, description) => {
      clearState();
      setLoading(true);

      try {
        // Step 1: Create order on backend
        const orderResult = await createPaymentOrder(sessionId, amount, description);

        if (!orderResult.success) {
          throw new Error(orderResult.error);
        }

        const { orderId } = orderResult;

        // Step 2: Open Razorpay payment form
        return new Promise((resolve, reject) => {
          const options = {
            key: process.env.REACT_APP_RAZORPAY_KEY_ID || 'RAZORPAY_KEY_ID',
            amount: amount, // Amount in paise
            currency: 'INR',
            name: 'Talent Qatar',
            description: description || 'Payment for Interview Session',
            order_id: orderId,
            
            // Handler for successful payment
            handler: async (response) => {
              try {
                // Step 3: Verify payment on backend
                const verifyResult = await verifyPayment(
                  orderId,
                  response.razorpay_payment_id,
                  response.razorpay_signature
                );

                if (verifyResult.success) {
                  setSuccess(true);
                  resolve({
                    success: true,
                    paymentId: response.razorpay_payment_id,
                    status: verifyResult.status
                  });
                } else {
                  throw new Error('Payment verification failed');
                }
              } catch (err) {
                setError(err.message);
                reject(err);
              } finally {
                setLoading(false);
              }
            },

            // Handler for payment failure
            modal: {
              ondismiss: () => {
                setLoading(false);
                setError('Payment cancelled by user');
                reject(new Error('Payment cancelled'));
              }
            }
          };

          // Prefill user information
          options.prefill = {
            name: 'User Name', // Get from user context
            email: 'user@example.com', // Get from user context
            contact: '9999999999' // Get from user context
          };

          // Theme customization
          options.theme = {
            color: '#3399cc' // Talent Qatar brand color
          };

          // Open Razorpay checkout
          const razorpay = new window.Razorpay(options);
          razorpay.open();
        });
      } catch (err) {
        setError(err.message);
        setLoading(false);
        throw err;
      }
    },
    [clearState]
  );

  /**
   * Check payment status
   */
  const checkPaymentStatus = useCallback(async (orderId) => {
    clearState();
    setLoading(true);

    try {
      const result = await getPaymentStatus(orderId);
      setLoading(false);
      return result;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [clearState]);

  /**
   * Process refund
   */
  const processRefund = useCallback(async (paymentId, reason = 'customer_request') => {
    clearState();
    setLoading(true);

    try {
      const result = await refundPayment(paymentId, reason);

      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error);
      }

      setLoading(false);
      return result;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [clearState]);

  /**
   * Fetch payment history
   */
  const fetchPaymentHistory = useCallback(async (limit = 20, skip = 0) => {
    clearState();
    setLoading(true);

    try {
      const result = await getPaymentHistory(limit, skip);
      setLoading(false);
      return result;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [clearState]);

  return {
    // State
    loading,
    error,
    success,
    clearState,
    
    // Methods
    initiatePayment,
    checkPaymentStatus,
    processRefund,
    fetchPaymentHistory
  };
}

// ============================================
// 4. COMPONENT: Payment Button Component
// ============================================

// File: src/components/PaymentButton.jsx

import { useState } from 'react';
import { usePayment } from '../hooks/usePayment';

function PaymentButton({ sessionId, amount, description, onSuccess, onError }) {
  const { loading, error, success, initiatePayment, clearState } = usePayment();

  const handlePaymentClick = async () => {
    try {
      clearState();

      const result = await initiatePayment(
        sessionId,
        amount,
        description || 'Interview Session'
      );

      if (result.success) {
        console.log('✅ Payment successful:', result);
        onSuccess?.(result);
      }
    } catch (err) {
      console.error('❌ Payment failed:', err);
      onError?.(err);
    }
  };

  return (
    <div className="payment-button-container">
      <button
        onClick={handlePaymentClick}
        disabled={loading}
        className="payment-button"
      >
        {loading ? 'Processing Payment...' : `Pay ₹${(amount / 100).toFixed(2)}`}
      </button>

      {error && (
        <div className="error-message">
          <p>❌ {error}</p>
          <button onClick={clearState}>Dismiss</button>
        </div>
      )}

      {success && (
        <div className="success-message">
          <p>✅ Payment successful! Your session has been unlocked.</p>
        </div>
      )}
    </div>
  );
}

export default PaymentButton;

// ============================================
// 5. COMPONENT: Payment Modal
// ============================================

// File: src/components/PaymentModal.jsx

import { useState } from 'react';
import { usePayment } from '../hooks/usePayment';

function PaymentModal({ isOpen, sessionId, amount, description, onClose, onSuccess }) {
  const { loading, error, success, initiatePayment, clearState } = usePayment();
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = async () => {
    try {
      await initiatePayment(sessionId, amount, description);
      setConfirmed(true);
    } catch (err) {
      console.error('Payment error:', err);
    }
  };

  const handleClose = () => {
    clearState();
    setConfirmed(false);
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Confirm Payment</h2>

        {!confirmed ? (
          <div className="payment-summary">
            <p>Session: <strong>{description}</strong></p>
            <p>Amount: <strong>₹{(amount / 100).toFixed(2)}</strong></p>
            <p>Currency: <strong>INR</strong></p>

            {error && (
              <div className="error-box">
                <p>❌ {error}</p>
              </div>
            )}

            <div className="button-group">
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="confirm-button"
              >
                {loading ? 'Processing...' : 'Proceed to Payment'}
              </button>
              <button
                onClick={handleClose}
                disabled={loading}
                className="cancel-button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="success-box">
            {success ? (
              <>
                <p>✅ Payment Successful!</p>
                <p>Your session is ready to begin.</p>
                <button onClick={handleClose}>Continue</button>
              </>
            ) : (
              <>
                <p>Redirecting to payment gateway...</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PaymentModal;

// ============================================
// 6. USAGE EXAMPLES IN PAGES
// ============================================

// File: src/pages/SessionPage.jsx

import PaymentButton from '../components/PaymentButton';
import { useSession } from '../hooks/useSession'; // Existing hook

function SessionPage() {
  const { session, loading } = useSession();
  const [paymentDone, setPaymentDone] = useState(false);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="session-page">
      <h1>{session.problem}</h1>

      {!paymentDone ? (
        <div className="payment-section">
          <h2>Unlock this session</h2>
          <p>Pay ₹500 to participate in this interview session</p>

          <PaymentButton
            sessionId={session._id}
            amount={50000} // ₹500 in paise
            description={`Mock Interview - ${session.problem}`}
            onSuccess={(result) => {
              setPaymentDone(true);
              // Unlock session
              // Navigate to interview room
            }}
            onError={(error) => {
              console.error('Payment error:', error);
              // Show error notification
            }}
          />
        </div>
      ) : (
        <div className="session-content">
          {/* Existing session UI */}
        </div>
      )}
    </div>
  );
}

export default SessionPage;


// ============================================
// 7. ENVIRONMENT CONFIGURATION
// ============================================

/*
File: .env or .env.local (add these variables)

VITE_RAZORPAY_KEY_ID=rzp_test_1234567890abcd
VITE_API_URL=http://localhost:3001

Usage in code:
const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
*/

// ============================================
// 8. ERROR HANDLING BEST PRACTICES
// ============================================

/*
Common errors and how to handle them:

1. Network Error
   - User loses connection
   - Handle: Show offline message, retry button

2. Payment Declined
   - Card rejected by Razorpay
   - Handle: Show card error, suggest contact bank

3. Verification Failed
   - Backend can't verify payment signature
   - Handle: Show error, contact support

4. Session Not Found
   - Session ID invalid or deleted
   - Handle: Redirect to sessions list

5. User Cancellation
   - User closes payment form
   - Handle: Allow retry or cancel

Example error handler:
*/

function handlePaymentError(error) {
  if (error.response?.status === 404) {
    console.error('Session not found');
    // Redirect to sessions list
  } else if (error.message.includes('declined')) {
    console.error('Card was declined');
    // Show card error message
  } else if (error.message.includes('cancelled')) {
    console.error('Payment cancelled by user');
    // Allow user to retry
  } else {
    console.error('Unknown error:', error);
    // Show generic error
  }
}

// ============================================
// 9. TESTING PAYMENT INTEGRATION
// ============================================

/*
Manual Testing Checklist:

[ ] Backend is running (npm run dev in backend)
[ ] RAZORPAY_KEY_ID is set in .env
[ ] RAZORPAY_WEBHOOK_SECRET is set in .env (for webhooks)
[ ] Database connection is working
[ ] Razorpay script is loaded in HTML

Test Scenarios:

1. Successful Payment
   - Click Pay button
   - Use card: 4111 1111 1111 1111
   - Enter any future date and CVV
   - Click Pay
   - Should see success message ✅

2. Failed Payment
   - Click Pay button
   - Use card: 4111 1111 1111 1112
   - Enter any future date and CVV
   - Click Pay
   - Should see error message ❌

3. Cancelled Payment
   - Click Pay button
   - Close the payment form
   - Should allow retry ↩️

4. Payment History
   - Make 2-3 test payments
   - Check payment history page
   - Should show all payments with status

5. Refund
   - Make successful payment
   - Click Refund button
   - Should show refund confirmation
   - Check status changes to "refunded"

*/

// ============================================
// 10. PRODUCTION CHECKLIST
// ============================================

/*
Before going live:

[ ] Switch to LIVE mode in Razorpay Dashboard
[ ] Update RAZORPAY_KEY_ID to LIVE key
[ ] Update RAZORPAY_KEY_SECRET to LIVE secret
[ ] Update RAZORPAY_WEBHOOK_SECRET to LIVE webhook secret
[ ] Update API_URL to production domain
[ ] Test with real payment cards (or small amount)
[ ] Set up error monitoring/logging
[ ] Configure webhook URL in Razorpay Dashboard
[ ] Test webhook delivery
[ ] Set up support process for failed payments
[ ] Document refund policy
[ ] Add Terms & Conditions mentioning payments
[ ] Test SSL/HTTPS on production domain
[ ] Monitor payment success/failure rates

*/

export default {
  usePayment
};
