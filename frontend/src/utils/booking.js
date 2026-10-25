import dayjs from 'dayjs';
import { BankOutlined, CreditCardOutlined, DollarOutlined, MobileOutlined, WalletOutlined } from '@ant-design/icons';

// Backend booking statuses: pending -> confirmed -> checked_in -> completed (or cancelled/expired).
// A pending booking with no payment request automatically becomes expired after payment_deadline (5 hours).
export const BOOKING_STATUS = {
  pending: { label: 'Chờ thanh toán', color: 'gold' },
  confirmed: { label: 'Đã xác nhận', color: 'green' },
  checked_in: { label: 'Đang lưu trú', color: 'blue' },
  completed: { label: 'Hoàn tất', color: 'default' },
  cancelled: { label: 'Đã huỷ', color: 'red' },
  expired: { label: 'Hết hạn', color: 'default' },
};

// Payment statuses: pending -> success -> refunded, or pending -> failed / cancelled
export const PAYMENT_STATUS = {
  pending: { label: 'Chờ xác nhận', color: 'gold' },
  success: { label: 'Đã thanh toán', color: 'green' },
  failed: { label: 'Thất bại', color: 'red' },
  cancelled: { label: 'Đã huỷ', color: 'default' },
  refunded: { label: 'Đã hoàn tiền', color: 'purple' },
};

// value must match ALLOWED_PAYMENT_METHODS in the backend
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Tiền mặt tại khách sạn', description: 'Thanh toán trực tiếp khi nhận phòng.', icon: DollarOutlined },
  { value: 'bank_transfer', label: 'Chuyển khoản ngân hàng', description: 'Chuyển khoản theo thông tin khách sạn cung cấp.', icon: BankOutlined },
  { value: 'credit_card', label: 'Thẻ tín dụng / ghi nợ', description: 'Visa, Mastercard, JCB.', icon: CreditCardOutlined },
  { value: 'momo', label: 'Ví MoMo', description: 'Thanh toán qua ví điện tử MoMo.', icon: MobileOutlined },
  { value: 'vnpay', label: 'VNPay', description: 'Thanh toán qua cổng VNPay.', icon: WalletOutlined },
];

export const paymentMethodLabel = (value) => PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;

export const canPayBooking = (booking) => booking.status === 'pending';

// The backend only allows cancelling pending/confirmed bookings, and only before the check-in date
export const canCancelBooking = (booking) =>
  ['pending', 'confirmed'].includes(booking.status) && dayjs(booking.check_in_date).isAfter(dayjs(), 'day');
