import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Card, Col, Descriptions, Radio, Result, Row, Skeleton, Space, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getBooking } from '../api/bookings';
import { cancelPayment, createPayment, getBookingPayments } from '../api/payments';
import BookingSteps from '../components/BookingSteps';
import BookingSummary from '../components/BookingSummary';
import { PaymentStatusTag } from '../components/StatusTags';
import { BANK_INFO, HOTEL_HOTLINE } from '../config/hotel';
import { BOOKING_STATUS, PAYMENT_METHODS, paymentMethodLabel } from '../utils/booking';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime, formatVND } from '../utils/format';

const POLL_MS = 8000; // poll the backend every 8 seconds while waiting for an admin to confirm

/** Payment instructions per method, shown once there is a payment awaiting confirmation. */
function PaymentInstructions({ payment, booking }) {
  if (payment.payment_method === 'bank_transfer') {
    return (
      <Descriptions
        bordered
        size="small"
        column={1}
        title="Thông tin chuyển khoản"
        items={[
          { key: 'bank', label: 'Ngân hàng', children: BANK_INFO.bankName },
          {
            key: 'acc',
            label: 'Số tài khoản',
            children: <Typography.Text copyable>{BANK_INFO.accountNumber}</Typography.Text>,
          },
          { key: 'name', label: 'Chủ tài khoản', children: BANK_INFO.accountName },
          { key: 'amount', label: 'Số tiền', children: <Typography.Text strong>{formatVND(payment.amount)}</Typography.Text> },
          {
            key: 'content',
            label: 'Nội dung chuyển khoản',
            children: (
              <Typography.Text strong copyable>
                {booking.booking_code}
              </Typography.Text>
            ),
          },
        ]}
      />
    );
  }

  if (payment.payment_method === 'cash') {
    return (
      <Typography.Paragraph>
        Vui lòng thanh toán <b>{formatVND(payment.amount)}</b> trực tiếp tại quầy lễ tân khi nhận phòng và đọc mã đặt
        phòng <Typography.Text strong copyable>{booking.booking_code}</Typography.Text> cho lễ tân.
      </Typography.Paragraph>
    );
  }

  // Card / MoMo / VNPay: no real gateway integrated yet
  return (
    <Typography.Paragraph>
      Cổng thanh toán <b>{paymentMethodLabel(payment.payment_method)}</b> chưa được tích hợp trong phiên bản này. Quản
      trị viên sẽ xác nhận sau khi nhận được thanh toán {formatVND(payment.amount)}. Cần hỗ trợ, hãy gọi {HOTEL_HOTLINE}.
    </Typography.Paragraph>
  );
}

export default function PaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [method, setMethod] = useState('bank_transfer');

  const paymentsQuery = useQuery({
    queryKey: ['payments', id],
    queryFn: () => getBookingPayments(id),
    refetchInterval: (query) => (query.state.data?.data?.some((p) => p.status === 'pending') ? POLL_MS : false),
  });

  const payments = paymentsQuery.data?.data ?? [];
  const pendingPayment = payments.find((p) => p.status === 'pending');
  const lastFailed = !pendingPayment && payments[0]?.status === 'failed';

  const bookingQuery = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBooking(id),
    refetchInterval: pendingPayment ? POLL_MS : false, // see the booking switch to "Confirmed" as soon as the admin approves
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['payments', id] });
    queryClient.invalidateQueries({ queryKey: ['booking', id] });
    queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
  };

  const payMutation = useMutation({
    mutationFn: createPayment,
    onSuccess: () => {
      message.success('Đã ghi nhận yêu cầu thanh toán.');
      refreshAll();
    },
    onError: (err) => message.error(getErrorMessage(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelPayment,
    onSuccess: () => {
      message.info('Đã huỷ yêu cầu thanh toán, bạn có thể chọn phương thức khác.');
      refreshAll();
    },
    onError: (err) => message.error(getErrorMessage(err)),
  });

  // ---------------------------------------------------------------- loading / error
  if (bookingQuery.isLoading || paymentsQuery.isLoading) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  if (bookingQuery.isError) {
    const notFound = bookingQuery.error.response?.status === 404;
    return (
      <Result
        status={notFound ? '404' : 'error'}
        title={notFound ? 'Không tìm thấy đơn đặt phòng' : 'Không thể tải đơn đặt phòng'}
        subTitle={notFound ? undefined : getErrorMessage(bookingQuery.error)}
        extra={
          <Link to="/bookings">
            <Button type="primary">Đặt phòng của tôi</Button>
          </Link>
        }
      />
    );
  }

  const booking = bookingQuery.data.booking;

  // ---------------------------------------------------------------- done / cannot be paid
  if (['confirmed', 'checked_in', 'completed'].includes(booking.status)) {
    return (
      <Result
        status="success"
        title="Thanh toán thành công"
        subTitle={`Đơn ${booking.booking_code} đã được xác nhận. Hẹn gặp bạn tại khách sạn!`}
        extra={[
          <Link key="detail" to={`/bookings/${booking.id}`}>
            <Button type="primary">Xem chi tiết đơn</Button>
          </Link>,
          <Link key="list" to="/bookings">
            <Button>Đặt phòng của tôi</Button>
          </Link>,
        ]}
      />
    );
  }

  if (booking.status !== 'pending') {
    return (
      <Result
        status="warning"
        title="Đơn này không thể thanh toán"
        subTitle={`Đơn ${booking.booking_code} đang ở trạng thái "${BOOKING_STATUS[booking.status]?.label ?? booking.status}".`}
        extra={
          <Link to="/bookings">
            <Button type="primary">Đặt phòng của tôi</Button>
          </Link>
        }
      />
    );
  }

  // ---------------------------------------------------------------- booking awaiting payment
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <BookingSteps current={2} />

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={14}>
          <Card title="Đơn đặt phòng">
            <BookingSummary booking={booking} />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          {/* There is a deadline only before a payment request is sent; once sent, it waits for admin confirmation and doesn't expire */}
          {!pendingPayment && booking.payment_deadline && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Phòng được giữ đến ${formatDateTime(booking.payment_deadline)}`}
              description="Hãy chọn phương thức thanh toán trước thời điểm này, nếu không đơn sẽ tự hết hạn và phòng được mở bán lại."
            />
          )}
          <Card title="Thanh toán">
            {pendingPayment ? (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Alert
                  type="info"
                  showIcon
                  message="Đang chờ xác nhận thanh toán"
                  description={
                    <>
                      Phương thức: <b>{paymentMethodLabel(pendingPayment.payment_method)}</b> ·{' '}
                      <PaymentStatusTag status={pendingPayment.status} />
                      <br />
                      Trang sẽ tự cập nhật khi khách sạn xác nhận.
                    </>
                  }
                />

                <PaymentInstructions payment={pendingPayment} booking={booking} />

                <Button
                  onClick={() => cancelMutation.mutate(pendingPayment.id)}
                  loading={cancelMutation.isPending}
                  block
                >
                  Đổi phương thức thanh toán
                </Button>
                <Button type="link" block onClick={() => navigate('/bookings')}>
                  Để sau, về danh sách đặt phòng
                </Button>
              </Space>
            ) : (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {lastFailed && (
                  <Alert type="warning" showIcon message="Lần thanh toán trước không thành công, vui lòng thử lại." />
                )}

                <Radio.Group value={method} onChange={(e) => setMethod(e.target.value)} style={{ width: '100%' }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {PAYMENT_METHODS.map(({ value, label, description, icon: Icon }) => (
                      <Radio key={value} value={value} style={{ width: '100%', padding: 12, border: '1px solid #f0f0f0', borderRadius: 8 }}>
                        <Space>
                          <Icon style={{ fontSize: 20 }} />
                          <span>
                            <b>{label}</b>
                            <br />
                            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                              {description}
                            </Typography.Text>
                          </span>
                        </Space>
                      </Radio>
                    ))}
                  </Space>
                </Radio.Group>

                <Button
                  type="primary"
                  size="large"
                  block
                  loading={payMutation.isPending}
                  onClick={() => payMutation.mutate({ bookingId: booking.id, paymentMethod: method })}
                >
                  Thanh toán {formatVND(booking.total_price)}
                </Button>
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
