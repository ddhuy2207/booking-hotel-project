import api, { unwrap } from './client';

/** The amount is taken from the booking by the backend; the frontend only sends booking_id and the method. */
export const createPayment = ({ bookingId, paymentMethod }) =>
  unwrap(api.post('/payments', { booking_id: Number(bookingId), payment_method: paymentMethod }));

export const getBookingPayments = (bookingId) => unwrap(api.get(`/payments/booking/${bookingId}`));

/** Cancel a pending payment (so the guest can switch to another method) */
export const cancelPayment = (paymentId) => unwrap(api.put(`/payments/${paymentId}/cancel`));

/** Confirm money received: payment -> success, booking -> confirmed */
export const confirmPayment = (paymentId) => unwrap(api.put(`/payments/${paymentId}/confirm`));

/** Mark as failed: booking stays pending, the guest can retry */
export const failPayment = (paymentId) => unwrap(api.put(`/payments/${paymentId}/fail`));

/** Refund: payment -> refunded and the booking is cancelled (not allowed after check-in) */
export const refundPayment = (paymentId) => unwrap(api.put(`/payments/${paymentId}/refund`));
