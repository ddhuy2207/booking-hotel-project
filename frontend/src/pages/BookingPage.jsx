import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  InputNumber,
  Result,
  Row,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createBooking } from '../api/bookings';
import { getRoomType } from '../api/rooms';
import BookingSteps from '../components/BookingSteps';
import RoomImage from '../components/RoomImage';
import { getErrorMessage } from '../utils/errors';
import { formatDate, formatVND } from '../utils/format';

/**
 * Step 2: confirm the booking.
 * Receives data from the detail page via the URL:
 *   /booking/new?room_type_id=5&check_in=2026-11-01&check_out=2026-11-04&room_ids=12,15
 */
export default function BookingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitError, setSubmitError] = useState(null);

  const roomTypeId = params.get('room_type_id');
  const checkIn = params.get('check_in');
  const checkOut = params.get('check_out');
  const roomIds = useMemo(
    () =>
      (params.get('room_ids') || '')
        .split(',')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    [params],
  );

  const valid = Boolean(roomTypeId && checkIn && checkOut && roomIds.length > 0);
  const backToDetail = `/rooms/${roomTypeId}?${new URLSearchParams({ check_in: checkIn || '', check_out: checkOut || '' })}`;

  // Same queryKey as the detail page, so the data already in the cache is reused
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['room-type', roomTypeId, checkIn, checkOut],
    queryFn: () => getRoomType(roomTypeId, { check_in: checkIn, check_out: checkOut }),
    enabled: valid,
  });

  const mutation = useMutation({
    mutationFn: createBooking,
    onSuccess: ({ booking }) => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      // Mark as stale but don't refetch right away, to avoid flashing "room no longer available" before navigating
      queryClient.invalidateQueries({ queryKey: ['room-type'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['rooms-search'], refetchType: 'none' });
      message.success('Đặt phòng thành công! Vui lòng thanh toán để xác nhận.');
      navigate(`/bookings/${booking.id}/pay`, { replace: true });
    },
    onError: (err) => setSubmitError(getErrorMessage(err)),
  });

  if (!valid) {
    return (
      <Result
        status="warning"
        title="Thiếu thông tin đặt phòng"
        subTitle="Vui lòng chọn loại phòng, ngày ở và phòng cụ thể trước khi đặt."
        extra={
          <Link to="/">
            <Button type="primary">Tìm phòng</Button>
          </Link>
        }
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  if (isError) {
    return (
      <Result
        status="error"
        title="Không thể tải thông tin đặt phòng"
        subTitle={getErrorMessage(error)}
        extra={
          <Link to={backToDetail}>
            <Button type="primary">Quay lại</Button>
          </Link>
        }
      />
    );
  }

  const roomType = data.room_type;
  const availability = roomType.availability;
  const freeRooms = availability?.available_rooms ?? [];
  const freeIds = new Set(freeRooms.map((r) => r.room_id));
  const selectedRooms = freeRooms.filter((r) => roomIds.includes(r.room_id));
  const unavailableIds = roomIds.filter((rid) => !freeIds.has(rid));

  const nights = availability?.nights ?? 0;
  const roomCount = selectedRooms.length;
  const total = roomType.price_per_night * nights * roomCount;
  const capacity = roomType.max_guests * Math.max(roomCount, 1);

  const onFinish = ({ guests }) => {
    setSubmitError(null);
    mutation.mutate({ check_in: checkIn, check_out: checkOut, room_ids: roomIds, guests });
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <BookingSteps current={1} />

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={15}>
          <Card title="Thông tin đặt phòng">
            {unavailableIds.length > 0 && (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
                message="Một số phòng bạn chọn không còn trống"
                description="Có thể phòng vừa được người khác đặt. Vui lòng chọn lại phòng."
                action={
                  <Link to={backToDetail}>
                    <Button size="small">Chọn lại phòng</Button>
                  </Link>
                }
              />
            )}

            {submitError && (
              <Alert
                type="error"
                showIcon
                closable
                onClose={() => setSubmitError(null)}
                style={{ marginBottom: 16 }}
                message="Không thể đặt phòng"
                description={submitError}
              />
            )}

            <Descriptions
              bordered
              column={1}
              size="small"
              items={[
                { key: 'type', label: 'Loại phòng', children: roomType.name },
                { key: 'in', label: 'Nhận phòng', children: formatDate(checkIn) },
                { key: 'out', label: 'Trả phòng', children: formatDate(checkOut) },
                { key: 'nights', label: 'Số đêm', children: nights },
                {
                  key: 'rooms',
                  label: 'Phòng đã chọn',
                  children: (
                    <Space wrap size={[4, 4]}>
                      {selectedRooms.map((r) => (
                        <Tag key={r.room_id} color="blue">
                          Phòng {r.room_number}
                        </Tag>
                      ))}
                    </Space>
                  ),
                },
              ]}
            />

            <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ guests: 1 }} style={{ marginTop: 24 }}>
              <Form.Item
                name="guests"
                label={`Số khách (tối đa ${capacity})`}
                rules={[{ required: true, message: 'Vui lòng nhập số khách' }]}
                extra="Mỗi phòng loại này chứa tối đa số khách đã nêu."
              >
                <InputNumber min={1} max={capacity} style={{ width: 160 }} />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={9}>
          <Card title="Tóm tắt giá">
            <RoomImage
              src={roomType.images[0]}
              alt={roomType.name}
              name={roomType.name}
              height={160}
            />

            <Descriptions
              column={1}
              size="small"
              style={{ marginTop: 16 }}
              items={[
                { key: 'price', label: 'Giá mỗi đêm', children: formatVND(roomType.price_per_night) },
                { key: 'calc', label: 'Số phòng × số đêm', children: `${roomCount} × ${nights}` },
                {
                  key: 'total',
                  label: <Typography.Text strong>Tổng cộng</Typography.Text>,
                  children: (
                    <Typography.Text strong style={{ color: '#d4380d', fontSize: 18 }}>
                      {formatVND(total)}
                    </Typography.Text>
                  ),
                },
              ]}
            />

            <Button
              type="primary"
              size="large"
              block
              loading={mutation.isPending}
              disabled={unavailableIds.length > 0 || roomCount === 0}
              onClick={() => form.submit()}
              style={{ marginTop: 8 }}
            >
              Xác nhận đặt phòng
            </Button>

            <Typography.Paragraph type="secondary" style={{ margin: '12px 0 0', fontSize: 13 }}>
              Sau khi xác nhận, đơn sẽ ở trạng thái chờ thanh toán. Bạn thanh toán ở bước tiếp theo.
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
