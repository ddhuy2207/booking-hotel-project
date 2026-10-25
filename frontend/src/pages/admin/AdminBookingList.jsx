import { useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Input, Select, Space, Table, Typography } from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { listBookings } from '../../api/admin';
import { BookingStatusTag } from '../../components/StatusTags';
import { BOOKING_STATUS } from '../../utils/booking';
import { getErrorMessage } from '../../utils/errors';
import { ISO_DATE_FORMAT, formatDate, formatVND, toIsoDate } from '../../utils/format';

const PER_PAGE = 20;

const STATUS_OPTIONS = Object.entries(BOOKING_STATUS).map(([value, { label }]) => ({ value, label }));

const columns = [
  {
    title: 'Mã đơn',
    dataIndex: 'booking_code',
    render: (code) => <Typography.Text strong>{code}</Typography.Text>,
  },
  {
    title: 'Khách',
    dataIndex: 'customer',
    render: (customer) => (
      <Space direction="vertical" size={0}>
        <Typography.Text>{customer.full_name}</Typography.Text>
        <Typography.Text type="secondary">{customer.phone || customer.email}</Typography.Text>
      </Space>
    ),
  },
  { title: 'Check-in', dataIndex: 'check_in_date', render: formatDate },
  { title: 'Check-out', dataIndex: 'check_out_date', render: formatDate },
  {
    title: 'Phòng',
    dataIndex: 'items',
    render: (items) => items.map((item) => item.room_number).join(', '),
  },
  { title: 'Tổng tiền', dataIndex: 'total_price', align: 'right', render: formatVND },
  { title: 'Trạng thái', dataIndex: 'status', render: (status) => <BookingStatusTag status={status} /> },
];

/**
 * Booking list for the front desk. Filters live in the URL (held by the parent page) so F5 / Back keeps them.
 * filters: { check_in, status, q, page }; onFiltersChange(patch) updates filters; onOpen(code) opens the booking detail.
 */
export default function AdminBookingList({ filters, onFiltersChange, onOpen }) {
  const [keyword, setKeyword] = useState(filters.q);
  useEffect(() => setKeyword(filters.q), [filters.q]);

  // Changing a filter always goes back to page 1
  const changeFilter = (patch) => onFiltersChange({ ...patch, page: undefined });

  const params = {
    check_in: filters.check_in || undefined,
    status: filters.status || undefined,
    q: filters.q || undefined,
    page: filters.page,
    per_page: PER_PAGE,
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['admin-bookings', params],
    queryFn: () => listBookings(params),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  const hasFilter = Boolean(filters.check_in || filters.status || filters.q);

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <DatePicker
          placeholder="Ngày check-in"
          format="DD/MM/YYYY"
          value={filters.check_in ? dayjs(filters.check_in, ISO_DATE_FORMAT) : null}
          onChange={(date) => changeFilter({ check_in: date ? toIsoDate(date) : undefined })}
        />
        <Select
          placeholder="Trạng thái"
          allowClear
          options={STATUS_OPTIONS}
          value={filters.status || undefined}
          onChange={(status) => changeFilter({ status })}
          style={{ width: 170 }}
        />
        <Input.Search
          allowClear
          placeholder="Mã đơn, tên, email, SĐT khách"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={(value) => changeFilter({ q: value.trim() || undefined })}
          style={{ width: 280 }}
        />
        {hasFilter && (
          <Button onClick={() => changeFilter({ check_in: undefined, status: undefined, q: undefined })}>Xoá bộ lọc</Button>
        )}
      </Space>

      {isError && (
        <Alert
          type="error"
          showIcon
          message="Không thể tải danh sách đơn"
          description={getErrorMessage(error)}
          action={<Button onClick={() => refetch()}>Thử lại</Button>}
        />
      )}

      <Table
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isLoading || isFetching}
        scroll={{ x: 800 }}
        locale={{ emptyText: hasFilter ? 'Không có đơn nào khớp bộ lọc' : 'Chưa có đơn đặt phòng nào' }}
        onRow={(booking) => ({ onClick: () => onOpen(booking.booking_code), style: { cursor: 'pointer' } })}
        pagination={{
          current: data?.pagination?.page ?? filters.page ?? 1,
          pageSize: PER_PAGE,
          total: data?.pagination?.total ?? 0,
          showSizeChanger: false,
          showTotal: (total) => `${total} đơn`,
          onChange: (page) => onFiltersChange({ page: page > 1 ? page : undefined }),
        }}
      />
    </Space>
  );
}
