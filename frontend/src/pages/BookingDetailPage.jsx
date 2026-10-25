import { Link, useNavigate, useParams } from 'react-router-dom';
import { App, Button, Card, Divider, Popconfirm, Result, Skeleton, Space, Table, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cancelBooking, getBooking } from '../api/bookings';
import { getBookingPayments } from '../api/payments';
import BookingSummary from '../components/BookingSummary';
import { PaymentStatusTag } from '../components/StatusTags';
import { canCancelBooking, canPayBooking, paymentMethodLabel } from '../utils/booking';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime, formatVND } from '../utils/format';

export default function BookingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();

  const bookingQuery = useQuery({ queryKey: ['booking', id], queryFn: () => getBooking(id) });
  const paymentsQuery = useQuery({ queryKey: ['payments', id], queryFn: () => getBookingPayments(id) });

  const cancelMutation = useMutation({
    mutationFn: () => cancelBooking(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['booking', id] });
      queryClient.invalidateQueries({ queryKey: ['payments', id] });
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['rooms-search'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['room-type'], refetchType: 'none' });

      if (result.refund_required) {
        modal.info({
          title: 'Đã huỷ đặt phòng',
          content: 'Đơn này đã thanh toán. Khách sạn sẽ liên hệ để hoàn tiền cho bạn, hoặc bạn có thể liên hệ trực tiếp để được hỗ trợ nhanh hơn.',
        });
      } else {
        message.success('Đã huỷ đặt phòng.');
      }
    },
    onError: (err) => message.error(getErrorMessage(err)),
  });

  if (bookingQuery.isLoading) {
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
  const payments = paymentsQuery.data?.data ?? [];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 900, margin: '0 auto' }}>
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/bookings')} style={{ paddingLeft: 0 }}>
        Danh sách đặt phòng
      </Button>

      <Card
        title="Chi tiết đặt phòng"
        extra={
          <Space>
            {canPayBooking(booking) && (
              <Link to={`/bookings/${booking.id}/pay`}>
                <Button type="primary">Thanh toán</Button>
              </Link>
            )}
            {canCancelBooking(booking) && (
              <Popconfirm
                title="Huỷ đặt phòng này?"
                description="Phòng sẽ được trả lại cho khách khác."
                okText="Huỷ đặt phòng"
                cancelText="Giữ lại"
                okButtonProps={{ danger: true, loading: cancelMutation.isPending }}
                onConfirm={() => cancelMutation.mutate()}
              >
                <Button danger>Huỷ đặt phòng</Button>
              </Popconfirm>
            )}
          </Space>
        }
      >
        <BookingSummary booking={booking} />

        <Divider orientation="left">Lịch sử thanh toán</Divider>
        <Table
          size="small"
          rowKey="id"
          loading={paymentsQuery.isLoading}
          pagination={false}
          dataSource={payments}
          locale={{ emptyText: 'Chưa có giao dịch thanh toán nào' }}
          columns={[
            { title: 'Thời gian', dataIndex: 'created_at', render: (v) => (v ? formatDateTime(v) : '—') },
            { title: 'Phương thức', dataIndex: 'payment_method', render: paymentMethodLabel },
            { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: formatVND },
            { title: 'Trạng thái', dataIndex: 'status', render: (status) => <PaymentStatusTag status={status} /> },
          ]}
        />

        {booking.status === 'cancelled' && payments.some((p) => p.status === 'success') && (
          <Typography.Paragraph type="warning" style={{ marginTop: 12 }}>
            Đơn đã huỷ và có khoản đã thanh toán đang chờ hoàn tiền. Vui lòng liên hệ khách sạn nếu cần hỗ trợ.
          </Typography.Paragraph>
        )}
      </Card>
    </Space>
  );
}
