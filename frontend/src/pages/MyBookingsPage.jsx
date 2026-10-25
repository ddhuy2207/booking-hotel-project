import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Card, Col, Empty, Popconfirm, Row, Skeleton, Space, Tabs, Tag, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cancelBooking, getMyBookings } from '../api/bookings';
import { BookingStatusTag } from '../components/StatusTags';
import { canCancelBooking, canPayBooking } from '../utils/booking';
import { getErrorMessage } from '../utils/errors';
import { formatDate, formatVND } from '../utils/format';

const FILTERS = [
  { key: 'all', label: 'Tất cả', match: () => true },
  { key: 'pending', label: 'Chờ thanh toán', match: (b) => b.status === 'pending' },
  { key: 'active', label: 'Sắp tới & đang ở', match: (b) => ['confirmed', 'checked_in'].includes(b.status) },
  { key: 'completed', label: 'Hoàn tất', match: (b) => b.status === 'completed' },
  { key: 'cancelled', label: 'Đã huỷ', match: (b) => ['cancelled', 'expired'].includes(b.status) },
];

function BookingCard({ booking, onCancel, cancelling }) {
  return (
    <Card size="small">
      <Row gutter={[16, 12]} justify="space-between" align="middle">
        <Col xs={24} md={15}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Space wrap>
              <Typography.Text strong copyable>
                {booking.booking_code}
              </Typography.Text>
              <BookingStatusTag status={booking.status} />
            </Space>

            <Typography.Text>
              {formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)} · {booking.nights} đêm
            </Typography.Text>

            <Space wrap size={[4, 4]}>
              {booking.items.map((item) => (
                <Tag key={item.room_id}>
                  Phòng {item.room_number} · {item.room_type_name}
                </Tag>
              ))}
            </Space>
          </Space>
        </Col>

        <Col xs={24} md={9} style={{ textAlign: 'right' }}>
          <Typography.Text strong style={{ fontSize: 18, color: '#d4380d' }}>
            {formatVND(booking.total_price)}
          </Typography.Text>

          <div style={{ marginTop: 8 }}>
            <Space wrap style={{ justifyContent: 'flex-end' }}>
              {canPayBooking(booking) && (
                <Link to={`/bookings/${booking.id}/pay`}>
                  <Button type="primary" size="small">
                    Thanh toán
                  </Button>
                </Link>
              )}
              <Link to={`/bookings/${booking.id}`}>
                <Button size="small">Chi tiết</Button>
              </Link>
              {canCancelBooking(booking) && (
                <Popconfirm
                  title="Huỷ đặt phòng này?"
                  description="Phòng sẽ được trả lại cho khách khác."
                  okText="Huỷ đặt phòng"
                  cancelText="Giữ lại"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => onCancel(booking.id)}
                >
                  <Button danger size="small" loading={cancelling}>
                    Huỷ
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </div>
        </Col>
      </Row>
    </Card>
  );
}

export default function MyBookingsPage() {
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: getMyBookings,
    staleTime: 0, // always refetch when opening the page: the status may have changed (admin confirmed, check-in...)
  });

  const cancelMutation = useMutation({
    mutationFn: cancelBooking,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['rooms-search'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['room-type'], refetchType: 'none' });
      if (result.refund_required) {
        modal.info({
          title: 'Đã huỷ đặt phòng',
          content: 'Đơn này đã thanh toán. Khách sạn sẽ liên hệ để hoàn tiền cho bạn.',
        });
      } else {
        message.success('Đã huỷ đặt phòng.');
      }
    },
    onError: (err) => message.error(getErrorMessage(err)),
  });

  const bookings = useMemo(() => data?.data ?? [], [data]);
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const visible = bookings.filter(activeFilter.match);

  const renderBody = () => {
    if (isLoading) {
      return (
        <Space direction="vertical" style={{ width: '100%' }}>
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i} size="small">
              <Skeleton active paragraph={{ rows: 2 }} />
            </Card>
          ))}
        </Space>
      );
    }

    if (isError) {
      return (
        <Alert
          type="error"
          showIcon
          message="Không thể tải danh sách đặt phòng"
          description={getErrorMessage(error)}
          action={<Button onClick={() => refetch()}>Thử lại</Button>}
        />
      );
    }

    if (visible.length === 0) {
      return (
        <Empty
          description={bookings.length === 0 ? 'Bạn chưa có đơn đặt phòng nào' : 'Không có đơn nào trong mục này'}
          style={{ padding: 48 }}
        >
          {bookings.length === 0 && (
            <Link to="/">
              <Button type="primary">Tìm phòng ngay</Button>
            </Link>
          )}
        </Empty>
      );
    }

    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {visible.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            onCancel={(bookingId) => cancelMutation.mutate(bookingId)}
            cancelling={cancelMutation.isPending && cancelMutation.variables === booking.id}
          />
        ))}
      </Space>
    );
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Typography.Title level={3}>Đặt phòng của tôi</Typography.Title>

      <Tabs
        activeKey={filter}
        onChange={setFilter}
        items={FILTERS.map((f) => ({
          key: f.key,
          label: `${f.label} (${bookings.filter(f.match).length})`,
        }))}
      />

      {renderBody()}
    </div>
  );
}
