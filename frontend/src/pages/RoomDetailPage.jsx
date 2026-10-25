import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Result,
  Row,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, HomeOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { getRoomType } from '../api/rooms';
import RoomImage from '../components/RoomImage';
import { getErrorMessage } from '../utils/errors';
import { formatDate, formatDateTime, formatVND, toIsoDate } from '../utils/format';

const { RangePicker } = DatePicker;

/** Large image with a thumbnail strip below; click a thumbnail to switch the large image, click the large image to zoom. */
function Gallery({ images, name }) {
  const [active, setActive] = useState(0);

  if (images.length === 0) return <RoomImage alt={name} name={name} height={380} />;

  const current = images[Math.min(active, images.length - 1)];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <RoomImage src={current} alt={name} name={name} height={380} preview />
      {images.length > 1 && (
        <Space wrap size={8}>
          {images.map((src, index) => (
            <div
              key={`${src}-${index}`}
              onClick={() => setActive(index)}
              style={{
                width: 88,
                height: 64,
                cursor: 'pointer',
                overflow: 'hidden',
                borderRadius: 6,
                border: index === active ? '2px solid #1677ff' : '2px solid transparent',
              }}
            >
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          ))}
        </Space>
      )}
    </Space>
  );
}

export default function RoomDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const checkIn = params.get('check_in');
  const checkOut = params.get('check_out');
  const hasDates = Boolean(checkIn && checkOut);

  const [selectedRoomIds, setSelectedRoomIds] = useState([]);

  const { data, error, isError, isLoading, isFetching } = useQuery({
    queryKey: ['room-type', id, checkIn, checkOut],
    queryFn: () => getRoomType(id, hasDates ? { check_in: checkIn, check_out: checkOut } : undefined),
    // When the dates change, keep the old data while loading, but not when switching to another room
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === id ? previous : undefined),
  });

  const roomType = data?.room_type;
  const availability = roomType?.availability;

  // Changing the dates clears the ticked rooms
  useEffect(() => {
    setSelectedRoomIds([]);
  }, [checkIn, checkOut]);

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/'));

  const onDatesChange = (dates) => {
    const next = new URLSearchParams(params);
    if (dates && dates[0] && dates[1]) {
      next.set('check_in', toIsoDate(dates[0]));
      next.set('check_out', toIsoDate(dates[1]));
    } else {
      next.delete('check_in');
      next.delete('check_out');
    }
    setParams(next, { replace: true });
  };

  // Go to the booking page. That route requires login, so users who are not logged in
  // are sent to /login and brought back here once they have logged in.
  const onBook = () => {
    const query = new URLSearchParams({
      room_type_id: id,
      check_in: checkIn,
      check_out: checkOut,
      room_ids: selectedRoomIds.join(','),
    });
    navigate(`/booking/new?${query.toString()}`);
  };

  // ------------------------------------------------------------------ loading / error states
  if (isLoading) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  if (isError) {
    const notFound = error.response?.status === 404;
    return (
      <Result
        status={notFound ? '404' : 'error'}
        title={notFound ? 'Không tìm thấy loại phòng' : 'Không thể tải thông tin phòng'}
        subTitle={notFound ? 'Loại phòng này không tồn tại hoặc đã ngừng kinh doanh.' : getErrorMessage(error)}
        extra={
          <Link to="/">
            <Button type="primary">Về trang tìm phòng</Button>
          </Link>
        }
      />
    );
  }

  const { images } = roomType;

  // ------------------------------------------------------------------ content
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={goBack} style={{ paddingLeft: 0 }}>
        Quay lại
      </Button>

      <Row gutter={[32, 24]}>
        <Col xs={24} lg={14}>
          <Gallery key={roomType.id} images={images} name={roomType.name} />

          <Divider orientation="left">Thông tin phòng</Divider>
          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, sm: 2 }}
            items={[
              { key: 'guests', label: 'Sức chứa', children: `Tối đa ${roomType.max_guests} khách / phòng` },
              { key: 'rooms', label: 'Số phòng loại này', children: `${roomType.total_rooms} phòng` },
              { key: 'price', label: 'Giá mỗi đêm', children: formatVND(roomType.price_per_night) },
              // { key: 'updated', label: 'Cập nhật lần cuối', children: roomType.updated_at ? formatDateTime(roomType.updated_at) : '—' },
            ]}
          />
          <Typography.Paragraph style={{ whiteSpace: 'pre-line', marginTop: 16 }}>
            {roomType.description || <Typography.Text type="secondary">Loại phòng này chưa có mô tả.</Typography.Text>}
          </Typography.Paragraph>
        </Col>

        <Col xs={24} lg={10}>
          <Typography.Title level={2} style={{ marginTop: 0 }}>
            {roomType.name}
          </Typography.Title>

          <Space wrap>
            <Tag icon={<TeamOutlined />}>Tối đa {roomType.max_guests} khách</Tag>
            <Tag icon={<HomeOutlined />}>{roomType.total_rooms} phòng</Tag>
          </Space>

          <div style={{ margin: '16px 0' }}>
            <Typography.Text strong style={{ fontSize: 28, color: '#d4380d' }}>
              {formatVND(roomType.price_per_night)}
            </Typography.Text>
            <Typography.Text type="secondary"> / đêm</Typography.Text>
          </div>

          <Card title="Kiểm tra phòng trống" size="small">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <RangePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                placeholder={['Nhận phòng', 'Trả phòng']}
                value={hasDates ? [dayjs(checkIn), dayjs(checkOut)] : null}
                onChange={onDatesChange}
                disabledDate={(current) => current && current.isBefore(dayjs().startOf('day'))}
              />

              {!availability && <Alert type="info" showIcon message="Chọn ngày để xem phòng trống và tổng tiền." />}

              {availability && (
                <Skeleton active loading={isFetching} paragraph={{ rows: 3 }}>
                  <Descriptions
                    column={1}
                    size="small"
                    items={[
                      { key: 'in', label: 'Nhận phòng', children: formatDate(availability.check_in) },
                      { key: 'out', label: 'Trả phòng', children: formatDate(availability.check_out) },
                      { key: 'nights', label: 'Số đêm', children: availability.nights },
                      {
                        key: 'total',
                        label: 'Tổng tiền / phòng',
                        children: (
                          <Typography.Text strong style={{ color: '#d4380d' }}>
                            {formatVND(availability.total_price)}
                          </Typography.Text>
                        ),
                      },
                    ]}
                  />

                  {availability.is_available ? (
                    <>
                      <Typography.Text strong>
                        Còn {availability.available_rooms.length} phòng trống, chọn phòng bạn muốn:
                      </Typography.Text>
                      <div style={{ marginTop: 8 }}>
                        <Checkbox.Group
                          value={selectedRoomIds}
                          onChange={setSelectedRoomIds}
                          options={availability.available_rooms.map((room) => ({
                            label: `Phòng ${room.room_number}`,
                            value: room.room_id,
                          }))}
                        />
                      </div>
                    </>
                  ) : (
                    <Alert type="warning" showIcon message="Đã hết phòng trong khoảng thời gian này." />
                  )}
                </Skeleton>
              )}

              <Button
                type="primary"
                size="large"
                block
                disabled={!availability?.is_available || selectedRoomIds.length === 0}
                onClick={onBook}
              >
                {selectedRoomIds.length > 0 ? `Đặt ${selectedRoomIds.length} phòng đã chọn` : 'Chọn phòng để đặt'}
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
