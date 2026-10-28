"""Exercise the real Stripe parser; dict mocks hide SDK compatibility errors."""
import hashlib
import hmac
import json
import time
from unittest.mock import patch

from django.test import TestCase, override_settings


@override_settings(STRIPE_SECRET_KEY='', STRIPE_WEBHOOK_SECRET='whsec_regression_test')
class StripeWebhookParsingTests(TestCase):
    def deliver(self, kind, fields, *, valid_signature=True):
        self.sequence = getattr(self, 'sequence', 0) + 1  # Stripe event ids are unique per event
        body = json.dumps({
            'id': f'evt_regression_test_{self.sequence}', 'object': 'event', 'livemode': False,
            'type': kind,
            'data': {'object': {'id': 'cs_regression_test', 'object': 'checkout.session', **fields}},
        }).encode()
        timestamp = str(int(time.time()))
        signature = hmac.new(
            b'whsec_regression_test', timestamp.encode() + b'.' + body, hashlib.sha256,
        ).hexdigest()
        if not valid_signature:
            signature = '0' * 64
        return self.client.post(
            '/api/payments/webhook', data=body, content_type='application/json',
            HTTP_STRIPE_SIGNATURE=f't={timestamp},v1={signature}',
        )

    @patch('payments.services.PaymentService._approve')
    def test_paid_events_parsed_by_stripe_reach_approval(self, approve):
        for kind in ('checkout.session.completed', 'checkout.session.async_payment_succeeded'):
            with self.subTest(kind=kind):
                approve.reset_mock()
                self.assertEqual(self.deliver(kind, {'payment_status': 'paid'}).status_code, 200)
                approve.assert_called_once_with('cs_regression_test', payment_id=None, payment_intent=None)

    @patch('payments.services.PaymentService._approve')
    def test_unpaid_or_missing_payment_status_does_not_approve(self, approve):
        for fields in ({'payment_status': 'unpaid'}, {}):
            with self.subTest(fields=fields):
                self.assertEqual(self.deliver('checkout.session.completed', fields).status_code, 200)
        approve.assert_not_called()

    @patch('payments.services.PaymentService._expire')
    def test_expiration_does_not_require_payment_status(self, expire):
        self.assertEqual(self.deliver('checkout.session.expired', {}).status_code, 200)
        expire.assert_called_once_with('cs_regression_test', payment_id=None)

    @patch('payments.services.PaymentService._approve')
    def test_invalid_signature_cannot_approve_payment(self, approve):
        response = self.deliver('checkout.session.completed', {'payment_status': 'paid'}, valid_signature=False)
        self.assertEqual(response.status_code, 400)
        approve.assert_not_called()
