import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'antd';
import { AppstoreOutlined, HomeOutlined, ProfileOutlined } from '@ant-design/icons';

import { useAuth } from '../../context/AuthContext';

/** Shared frame for admin pages: horizontal menu on top, content below. */
export default function AdminLayout() {
  const { user } = useAuth();
  const location = useLocation();

  const items = [
    { key: '/admin/bookings', icon: <ProfileOutlined />, label: <Link to="/admin/bookings">Đơn đặt phòng</Link> },
    // Room types are admin only; staff only see the room list
    ...(user?.role === 'admin'
      ? [{ key: '/admin/room-types', icon: <AppstoreOutlined />, label: <Link to="/admin/room-types">Loại phòng</Link> }]
      : []),
    { key: '/admin/rooms', icon: <HomeOutlined />, label: <Link to="/admin/rooms">Phòng</Link> },
  ];

  return (
    <>
      <Menu mode="horizontal" selectedKeys={[location.pathname]} items={items} style={{ marginBottom: 24 }} />
      <Outlet />
    </>
  );
}
