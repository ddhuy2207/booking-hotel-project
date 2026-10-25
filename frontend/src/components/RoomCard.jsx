import { useNavigate } from 'react-router-dom';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { PictureOutlined, TeamOutlined } from '@ant-design/icons';

import { formatVND } from '../utils/format';
import RoomImage from './RoomImage';

/**
 * room: one item of the /rooms/search response
 * detailQuery: query string (check_in, check_out) so the detail page knows which dates the guest is searching
 */
export default function RoomCard({ room, nights, detailQuery }) {
  const navigate = useNavigate();
  const { images } = room; // "/static/uploads/..." URLs returned by the backend, usable as-is
  const lowStock = room.available_rooms <= 2;
  const goDetail = () => navigate(`/rooms/${room.room_type_id}?${detailQuery}`);

  return (
    <Card
      hoverable
      onClick={goDetail}
      style={{ height: '100%' }}
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 8 } }}
      cover={
        <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
          <RoomImage src={images[0]} alt={room.name} name={room.name} height={200} />
          {images.length > 1 && (
            <Tag icon={<PictureOutlined />} style={{ position: 'absolute', right: 8, bottom: 8, margin: 0 }}>
              {images.length}
            </Tag>
          )}
        </div>
      }
    >
      <Typography.Title level={5} ellipsis style={{ margin: 0 }}>
        {room.name}
      </Typography.Title>

      <Space wrap size={[4, 4]}>
        <Tag icon={<TeamOutlined />}>Tối đa {room.max_guests} khách</Tag>
        <Tag color={lowStock ? 'orange' : 'green'}>Còn {room.available_rooms} phòng</Tag>
      </Space>

      {room.description && (
        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0 }}>
          {room.description}
        </Typography.Paragraph>
      )}

      <div style={{ marginTop: 'auto' }}>
        <Typography.Text strong style={{ fontSize: 18, color: '#d4380d' }}>
          {formatVND(room.price_per_night)}
        </Typography.Text>
        <Typography.Text type="secondary"> / đêm</Typography.Text>
        <div>
          <Typography.Text type="secondary">
            {nights} đêm: {formatVND(room.total_price)}
          </Typography.Text>
        </div>
      </div>

      <Button type="primary" block>
        Xem chi tiết
      </Button>
    </Card>
  );
}
