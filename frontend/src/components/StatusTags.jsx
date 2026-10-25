import { Tag } from 'antd';

import { BOOKING_STATUS, PAYMENT_STATUS } from '../utils/booking';

export function BookingStatusTag({ status }) {
  const info = BOOKING_STATUS[status] || { label: status, color: 'default' };
  return <Tag color={info.color}>{info.label}</Tag>;
}

export function PaymentStatusTag({ status }) {
  const info = PAYMENT_STATUS[status] || { label: status, color: 'default' };
  return <Tag color={info.color}>{info.label}</Tag>;
}
