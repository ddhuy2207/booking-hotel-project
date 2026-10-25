import { Steps } from 'antd';

/** current: 0 = choose rooms, 1 = confirm booking, 2 = payment */
export default function BookingSteps({ current }) {
  return (
    <Steps
      current={current}
      size="small"
      items={[{ title: 'Chọn phòng' }, { title: 'Xác nhận đặt phòng' }, { title: 'Thanh toán' }]}
    />
  );
}
