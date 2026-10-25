import { Descriptions, Space, Table, Typography } from 'antd';

import { formatDate, formatDateTime, formatVND } from '../utils/format';
import { BookingStatusTag } from './StatusTags';

/** Booking info: code, status, dates, and a table of booked rooms. booking = an item from the API. */
export default function BookingSummary({ booking }) {
  return (
    <>
      <Descriptions
        bordered
        size="small"
        column={{ xs: 1, sm: 2 }}
        items={[
          {
            key: 'code',
            label: 'Mã đặt phòng',
            children: (
              <Typography.Text strong copyable>
                {booking.booking_code}
              </Typography.Text>
            ),
          },
          { key: 'status', label: 'Trạng thái', children: <BookingStatusTag status={booking.status} /> },
          { key: 'in', label: 'Nhận phòng', children: formatDate(booking.check_in_date) },
          { key: 'out', label: 'Trả phòng', children: formatDate(booking.check_out_date) },
          { key: 'nights', label: 'Số đêm', children: booking.nights },
          {
            key: 'created',
            label: 'Ngày đặt',
            children: booking.created_at ? formatDateTime(booking.created_at) : '—',
          },
        ]}
      />

      <Table
        size="small"
        style={{ marginTop: 16 }}
        pagination={false}
        rowKey="room_id"
        dataSource={booking.items}
        columns={[
          {
            title: 'Phòng',
            key: 'room',
            render: (_, item) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>Phòng {item.room_number}</Typography.Text>
                <Typography.Text type="secondary">{item.room_type_name}</Typography.Text>
              </Space>
            ),
          },
          { title: 'Giá / đêm', dataIndex: 'price_per_night', align: 'right', render: formatVND },
          { title: 'Thành tiền', dataIndex: 'subtotal', align: 'right', render: formatVND },
        ]}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={2}>
              <Typography.Text strong>Tổng cộng</Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              <Typography.Text strong style={{ color: '#d4380d', fontSize: 16 }}>
                {formatVND(booking.total_price)}
              </Typography.Text>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </>
  );
}
