import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Divider,
  Empty,
  Input,
  Popconfirm,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { checkInBooking, checkOutBooking, lookupBooking } from '../../api/admin';
import { confirmPayment, failPayment, getBookingPayments, refundPayment } from '../../api/payments';
import BookingSummary from '../../components/BookingSummary';
import { PaymentStatusTag } from '../../components/StatusTags';
import { useAuth } from '../../context/AuthContext';
import { paymentMethodLabel } from '../../utils/booking';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, formatDateTime, formatVND } from '../../utils/format';
import AdminBookingList from './AdminBookingList';

/**
 * Front desk screen: browse the booking list (filter by check-in date, status, keyword) or enter the code the guest provides,
 * then open the booking to confirm payment, check in, or check out.
 * The open booking code (?code=...) and the list filters both live in the URL so F5 / Back keeps them.
 */
export default function AdminBookingsPage() {
  const [params, setParams] = useSearchParams();
  const code = (params.get('code') || '').trim().toUpperCase();
  const listFilters = {
    check_in: params.get('check_in') || undefined,
    status: params.get('status') || undefined,
    q: params.get('q') || undefined,
    page: Number(params.get('page')) || undefined,
  };
  const [input, setInput] = useState(code);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin'; // confirm / reject / refund is admin only; staff can only check in/out
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();

  useEffect(() => setInput(code), [code]);

  const bookingQuery = useQuery({
    queryKey: ['admin-booking', code],
    queryFn: () => lookupBooking(code),
    enabled: Boolean(code),
    staleTime: 0,
  });
  const booking = bookingQuery.data?.booking;

  // The backend only lets admins list payments of other users' bookings, so staff don't call it
  const paymentsQuery = useQuery({
    queryKey: ['payments', String(booking?.id)],
    queryFn: () => getBookingPayments(booking.id),
    enabled: Boolean(booking) && isAdmin,
    staleTime: 0,
  });
  const payments = paymentsQuery.data?.data ?? [];

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-booking'] });
    queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['booking'] });
    queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['admin-rooms'] });
    queryClient.invalidateQueries({ queryKey: ['rooms-search'], refetchType: 'none' });
    queryClient.invalidateQueries({ queryKey: ['room-type'], refetchType: 'none' });
  };

  const onError = (error) => message.error(getErrorMessage(error));

  const confirmMutation = useMutation({
    mutationFn: confirmPayment,
    onSuccess: () => {
      message.success('Đã xác nhận thanh toán, đơn chuyển sang "Đã xác nhận".');
      refreshAll();
    },
    onError,
  });

  const failMutation = useMutation({
    mutationFn: failPayment,
    onSuccess: () => {
      message.info('Đã đánh dấu thanh toán thất bại. Khách có thể thanh toán lại.');
      refreshAll();
    },
    onError,
  });

  const refundMutation = useMutation({
    mutationFn: refundPayment,
    onSuccess: () => {
      modal.info({
        title: 'Đã ghi nhận hoàn tiền',
        content: 'Đơn đã bị huỷ và phòng được trả lại. Hãy chuyển tiền thực tế cho khách ngoài hệ thống.',
      });
      refreshAll();
    },
    onError,
  });

  const checkInMutation = useMutation({
    mutationFn: checkInBooking,
    onSuccess: () => {
      message.success('Check-in thành công.');
      refreshAll();
    },
    onError,
  });

  const checkOutMutation = useMutation({
    mutationFn: checkOutBooking,
    onSuccess: (result) => {
      message.success(
        result.checked_out_early
          ? `Check-out thành công. Trả phòng sớm: ngày trả được rút về ${formatDate(result.booking.check_out_date)}.`
          : 'Check-out thành công.',
      );
      refreshAll();
    },
    onError,
  });

  // Merge changes into the current URL; empty/undefined values are removed from the URL
  const updateParams = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') next.delete(key);
      else next.set(key, String(value));
    });
    setParams(next);
  };

  const search = (value) => updateParams({ code: value.trim().toUpperCase() || undefined });

  // ---------------------------------------------------------------- result panel
  const renderBody = () => {
    if (!code) {
      return (
        <AdminBookingList
          filters={listFilters}
          onFiltersChange={updateParams}
          onOpen={(bookingCode) => updateParams({ code: bookingCode })}
        />
      );
    }
    if (bookingQuery.isLoading) {
      return (
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      );
    }
    if (bookingQuery.isError) {
      const notFound = bookingQuery.error.response?.status === 404;
      return notFound ? (
        <Empty description={`Không tìm thấy đơn có mã "${code}"`} style={{ padding: 48 }} />
      ) : (
        <Alert
          type="error"
          showIcon
          message="Không thể tra cứu đơn"
          description={getErrorMessage(bookingQuery.error)}
          action={<Button onClick={() => bookingQuery.refetch()}>Thử lại</Button>}
        />
      );
    }

    const canCheckIn = booking.status === 'confirmed';
    const canCheckOut = booking.status === 'checked_in';
    const pendingPayments = payments.filter((p) => p.status === 'pending');

    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {booking.status === 'pending' && (
          <Alert
            type="warning"
            showIcon
            message="Đơn chưa được thanh toán"
            description={
              isAdmin
                ? pendingPayments.length > 0
                  ? 'Khách đã gửi yêu cầu thanh toán. Xác nhận bên dưới sau khi đã nhận tiền.'
                  : 'Chưa có yêu cầu thanh toán nào. Khách cần chọn phương thức thanh toán trước.'
                : 'Cần quản trị viên xác nhận thanh toán trước khi check-in.'
            }
          />
        )}

        <Card
          title="Thông tin đơn"
          extra={
            <Space wrap>
              <Popconfirm
                title="Check-in cho đơn này?"
                description="Các phòng sẽ chuyển sang trạng thái có khách."
                okText="Check-in"
                cancelText="Huỷ"
                disabled={!canCheckIn}
                onConfirm={() => checkInMutation.mutate(booking.id)}
              >
                <Button type="primary" disabled={!canCheckIn} loading={checkInMutation.isPending}>
                  Check-in
                </Button>
              </Popconfirm>

              <Popconfirm
                title="Check-out cho đơn này?"
                description="Phòng được trả về sẵn sàng. Nếu trả sớm, các đêm còn lại sẽ mở bán lại và không tự hoàn tiền."
                okText="Check-out"
                cancelText="Huỷ"
                disabled={!canCheckOut}
                onConfirm={() => checkOutMutation.mutate(booking.id)}
              >
                <Button disabled={!canCheckOut} loading={checkOutMutation.isPending}>
                  Check-out
                </Button>
              </Popconfirm>
            </Space>
          }
        >
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2 }}
            style={{ marginBottom: 16 }}
            items={[
              { key: 'name', label: 'Khách hàng', children: booking.customer.full_name },
              { key: 'email', label: 'Email', children: booking.customer.email },
              { key: 'phone', label: 'Điện thoại', children: booking.customer.phone || '—' },
              {
                key: 'paid',
                label: 'Thanh toán',
                children: booking.paid ? <Tag color="green">Đã thanh toán</Tag> : <Tag color="gold">Chưa thanh toán</Tag>,
              },
            ]}
          />
          <BookingSummary booking={booking} />
        </Card>

        <Card title="Thanh toán">
          {!isAdmin ? (
            <Typography.Text type="secondary">
              Chỉ quản trị viên được xem và xác nhận thanh toán. Trạng thái hiện tại:{' '}
              {booking.paid ? 'đã thanh toán.' : 'chưa thanh toán.'}
            </Typography.Text>
          ) : (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              loading={paymentsQuery.isLoading}
              dataSource={payments}
              locale={{ emptyText: 'Chưa có giao dịch thanh toán nào' }}
              columns={[
                { title: 'Thời gian', dataIndex: 'created_at', render: (v) => (v ? formatDateTime(v) : '—') },
                { title: 'Phương thức', dataIndex: 'payment_method', render: paymentMethodLabel },
                { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: formatVND },
                { title: 'Trạng thái', dataIndex: 'status', render: (s) => <PaymentStatusTag status={s} /> },
                {
                  title: 'Thao tác',
                  key: 'actions',
                  align: 'right',
                  render: (_, payment) => {
                    if (payment.status === 'pending') {
                      return (
                        <Space>
                          <Popconfirm
                            title={`Xác nhận đã nhận ${formatVND(payment.amount)}?`}
                            okText="Xác nhận"
                            cancelText="Huỷ"
                            onConfirm={() => confirmMutation.mutate(payment.id)}
                          >
                            <Button
                              type="primary"
                              size="small"
                              loading={confirmMutation.isPending && confirmMutation.variables === payment.id}
                            >
                              Xác nhận
                            </Button>
                          </Popconfirm>
                          <Popconfirm
                            title="Đánh dấu thanh toán thất bại?"
                            description="Đơn vẫn giữ chỗ và khách có thể thanh toán lại."
                            okText="Thất bại"
                            cancelText="Huỷ"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => failMutation.mutate(payment.id)}
                          >
                            <Button
                              danger
                              size="small"
                              loading={failMutation.isPending && failMutation.variables === payment.id}
                            >
                              Từ chối
                            </Button>
                          </Popconfirm>
                        </Space>
                      );
                    }

                    // The backend doesn't allow refunds after check-in / completion
                    if (payment.status === 'success') {
                      const locked = ['checked_in', 'completed'].includes(booking.status);
                      return (
                        <Popconfirm
                          title="Hoàn tiền và huỷ đơn?"
                          description="Đơn sẽ bị huỷ và phòng được trả lại cho khách khác."
                          okText="Hoàn tiền"
                          cancelText="Huỷ"
                          okButtonProps={{ danger: true }}
                          disabled={locked}
                          onConfirm={() => refundMutation.mutate(payment.id)}
                        >
                          <Button
                            size="small"
                            danger
                            disabled={locked}
                            loading={refundMutation.isPending && refundMutation.variables === payment.id}
                          >
                            Hoàn tiền
                          </Button>
                        </Popconfirm>
                      );
                    }

                    return null;
                  },
                },
              ]}
            />
          )}
        </Card>
      </Space>
    );
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <Typography.Title level={3}>Quản lý đơn đặt phòng</Typography.Title>

      <Input.Search
        size="large"
        allowClear
        enterButton="Tra cứu"
        placeholder="Nhập mã đặt phòng, ví dụ BK1A2B3C4D5E"
        value={input}
        onChange={(e) => setInput(e.target.value.toUpperCase())}
        onSearch={search}
        maxLength={15}
        style={{ marginBottom: 24 }}
      />

      <Divider style={{ margin: '0 0 24px' }} />

      {code && (
        <Button icon={<ArrowLeftOutlined />} onClick={() => updateParams({ code: undefined })} style={{ marginBottom: 16 }}>
          Danh sách đơn
        </Button>
      )}

      {renderBody()}
    </div>
  );
}
