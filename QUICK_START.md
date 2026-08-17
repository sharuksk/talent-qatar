# Payment Integration - Quick Reference

## 🚀 Get Started in 5 Minutes

### 1. Get Free Razorpay Credentials (2 min)
```
1. Visit: https://razorpay.com/
2. Click "Sign Up"
3. Verify email
4. Dashboard → Settings → API Keys
5. Copy Test Key ID and Test Key Secret
```

### 2. Set Environment Variables (1 min)
```bash
cd backend
cp .env.example .env.local

# Edit .env.local and replace:
RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_ID
RAZORPAY_KEY_SECRET=test_YOUR_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=whsec_YOUR_SECRET
```

### 3. Start Backend (1 min)
```bash
cd backend
npm run dev
# Server running on http://localhost:3001
```

### 4. Create Test Payment (1 min)
```bash
# Get your auth token from frontend login

curl -X POST http://localhost:3001/api/payment/create-order \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "any_session_id",
    "amount": 50000,
    "description": "Test Payment"
  }'

# Response:
# {
#   "success": true,
#   "orderId": "order_123abc",
#   "amount": 50000
# }
```

---

## 💳 Test With Test Cards

| Card Number | Type | Result |
|-------------|------|--------|
| 4111 1111 1111 1111 | Visa | ✅ Success |
| 4111 1111 1111 1112 | Visa | ❌ Failure |
| 5555 5555 5555 4444 | Mastercard | ✅ Auth |

**For all test cards:**
- Expiry: Any future date (e.g., 12/25)
- CVV: Any 3 digits (e.g., 123)
- Name: Any name

---

## 📚 Key Files

### Backend
| File | Purpose |
|------|---------|
| `src/models/Payment.js` | Payment schema |
| `src/models/IdempotencyKey.js` | Idempotency tracking |
| `src/lib/paymentService.js` | Razorpay API client |
| `src/lib/hmacUtils.js` | HMAC signing |
| `src/controllers/paymentController.js` | Payment endpoints |
| `src/controllers/webhookController.js` | Webhook handlers |
| `src/middleware/hmacVerification.js` | Signature verification |
| `src/middleware/idempotency.js` | Duplicate prevention |
| `src/routes/paymentRoutes.js` | API routes |

### Frontend
| File | Purpose |
|------|---------|
| `src/api/paymentIntegration.js` | API client + hooks |

### Documentation
| File | Purpose |
|------|---------|
| `PAYMENT_SETUP.md` | Complete setup guide |
| `PAYMENT_TESTS.js` | Test scenarios |
| `.env.example` | Environment template |

---

## 🔌 API Quick Reference

### Create Payment Order
```javascript
POST /api/payment/create-order
Header: Authorization: Bearer token

Request:
{
  "sessionId": "string",
  "amount": 50000,
  "description": "string"
}

Response:
{
  "success": true,
  "orderId": "order_123",
  "amount": 50000,
  "currency": "INR"
}
```

### Verify Payment
```javascript
POST /api/payment/verify
Header: Authorization: Bearer token

Request:
{
  "orderId": "order_123",
  "paymentId": "pay_456",
  "signature": "signature_hash"
}

Response:
{
  "success": true,
  "status": "captured"
}
```

### Get Payment Status
```javascript
GET /api/payment/:orderId
Header: Authorization: Bearer token

Response:
{
  "success": true,
  "status": "captured",
  "amount": 50000
}
```

### Refund Payment
```javascript
POST /api/payment/refund
Header: Authorization: Bearer token

Request:
{
  "paymentId": "pay_456",
  "reason": "customer_request",
  "amount": 25000  // optional
}

Response:
{
  "success": true,
  "refundId": "rfnd_789"
}
```

### Webhook Handler
```javascript
POST /api/payment/webhook
Header: X-Razorpay-Signature: signature

Request:
{
  "id": "webhook_123",
  "event": "payment.captured",
  "payload": {...}
}

Response:
{
  "success": true,
  "message": "Webhook processed"
}
```

---

## 🔐 Security Features

### HMAC Verification
```
✅ Every webhook signed with Razorpay's secret
✅ Server verifies signature before processing
✅ Rejects unsigned or forged webhooks (401)
```

### Idempotency
```
✅ Prevents duplicate payment processing
✅ Detects webhook retries automatically
✅ Returns cached response on duplicates
```

### Request Signing
```
✅ All API requests authenticated
✅ Basic Auth with API Key ID + Secret
✅ Constant-time comparison for signatures
```

---

## ⚙️ Configuration

### Change Default Amount
Edit `backend/src/controllers/paymentController.js`:
```javascript
if (amount > 500000) { // Max ₹5000
  return res.status(400).json({ error: 'Amount too high' });
}
```

### Change Idempotency TTL
Edit `backend/src/models/IdempotencyKey.js`:
```javascript
expiresAt: {
  type: Date,
  default: () => new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
  index: { expireAfterSeconds: 0 }
}
```

### Add More Webhook Events
Edit `backend/src/controllers/webhookController.js`:
```javascript
case 'custom.event':
  result = await handleCustomEvent(payload);
  break;
```

---

## 🧪 Testing Checklist

- [ ] Create test order
- [ ] Verify payment with test card (success)
- [ ] Verify payment with test card (failure)
- [ ] Check payment history
- [ ] Test refund (full)
- [ ] Test refund (partial)
- [ ] Test webhook idempotency (send twice)
- [ ] Check payment status
- [ ] Test error cases (invalid session, missing fields)
- [ ] Check database records (Payment, IdempotencyKey)

---

## 🐛 Common Issues

### "Invalid API key"
✅ Check RAZORPAY_KEY_ID in .env.local

### "Webhook secret not configured"
✅ Add RAZORPAY_WEBHOOK_SECRET to .env.local

### "Payment not found"
✅ Check orderId matches what was created

### "Signature verification failed"
✅ Verify RAZORPAY_WEBHOOK_SECRET is correct

### "Payment already pending"
✅ Wait for first payment to complete or cancel

---

## 🚀 Production Steps

1. Switch Razorpay mode from Test to Live
2. Get LIVE API credentials from Dashboard
3. Update .env file with LIVE keys
4. Update API_URL to production domain
5. Test with small real payment
6. Set up webhook URL in Razorpay Dashboard
7. Monitor payment success rates
8. Set up support process for issues

---

## 📱 Frontend Usage

### Basic Button
```jsx
import { usePayment } from '../hooks/usePayment';

function PaymentButton({ sessionId, amount }) {
  const { initiatePayment, loading, error } = usePayment();

  return (
    <button onClick={() => initiatePayment(sessionId, amount)} disabled={loading}>
      {loading ? 'Processing...' : `Pay ₹${amount / 100}`}
    </button>
  );
}
```

### With Modal
```jsx
import PaymentModal from '../components/PaymentModal';
import { useState } from 'react';

function SessionPage() {
  const [showPayment, setShowPayment] = useState(false);

  return (
    <>
      <button onClick={() => setShowPayment(true)}>Buy Session</button>
      <PaymentModal
        isOpen={showPayment}
        sessionId={sessionId}
        amount={50000}
        onSuccess={() => unlockSession()}
        onClose={() => setShowPayment(false)}
      />
    </>
  );
}
```

---

## 📊 Database Queries

### Get all payments for user
```javascript
Payment.find({ userId: user._id }).sort({ createdAt: -1 });
```

### Get pending payments
```javascript
Payment.find({ status: 'pending' }).limit(10);
```

### Get webhook statistics
```javascript
IdempotencyKey.aggregate([
  { $group: {
    _id: null,
    total: { $sum: 1 },
    retries: { $sum: '$retryCount' },
    errors: { $sum: { $cond: ['$error.occurred', 1, 0] } }
  }}
]);
```

### Find webhook by ID
```javascript
IdempotencyKey.findOne({ idempotencyKey: 'sha256hash' });
```

---

## 🎯 Next Steps

1. **Get Credentials** (5 min)
   - Sign up on Razorpay
   - Copy test keys

2. **Set Environment** (1 min)
   - Update .env.local

3. **Start Backend** (1 min)
   - `npm run dev`

4. **Test Payment** (2 min)
   - Create order
   - Verify with test card

5. **Integrate Frontend** (5 min)
   - Add payment component
   - Test user flow

6. **Go Live** (when ready)
   - Get LIVE credentials
   - Update environment
   - Test with real payment

---

## 📞 Help & Resources

- **Razorpay Docs**: https://razorpay.com/docs/
- **Setup Guide**: Read `PAYMENT_SETUP.md`
- **Tests**: Check `PAYMENT_TESTS.js`
- **Frontend**: See `frontend/src/api/paymentIntegration.js`

---

**Status**: ✅ **READY TO USE**

All code is production-ready. Just add your credentials and start accepting payments!
