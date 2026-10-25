import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { App, Avatar, Button, ConfigProvider, Drawer, Dropdown, Layout, Menu, Skeleton, Space, Typography, theme } from 'antd';
import { LogoutOutlined, MenuOutlined, ProfileOutlined, UserOutlined } from '@ant-design/icons';

import { useAuth } from '../context/AuthContext';

const { Header, Content, Footer } = Layout;

/** true when the media query matches; updates automatically on window resize / device rotation. */
function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

export default function AppLayout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const { token } = theme.useToken();

  // < 500px: menu goes into the hamburger. 500–767px: horizontal but compact menu (labels hidden, less spacing),
  // and at 500–619px the logo shrinks to its icon so all 3 admin items fit.
  const isMobile = useMediaQuery('(max-width: 499.98px)');
  const isCompact = useMediaQuery('(max-width: 767.98px)');
  const isNarrow = useMediaQuery('(max-width: 619.98px)');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer on navigation (including Back) or when the screen gets wider
  useEffect(() => setDrawerOpen(false), [location.pathname, isMobile]);

  const navItems = [
    { key: '/', label: <Link to="/">Tìm phòng</Link> },
    ...(user ? [{ key: '/bookings', label: <Link to="/bookings">Đặt phòng của tôi</Link> }] : []),
    ...(['admin', 'staff'].includes(user?.role)
      ? [{ key: '/admin', label: <Link to="/admin">Quản trị</Link> }]
      : []),
  ];
  // Child pages (e.g. /bookings/12/pay) still highlight their parent item
  const selectedKey = location.pathname.startsWith('/bookings')
    ? '/bookings'
    : location.pathname.startsWith('/admin')
      ? '/admin'
      : location.pathname === '/'
        ? '/'
        : '';

  const menuItems = [
    { key: 'profile', icon: <UserOutlined />, label: 'Hồ sơ của tôi', onClick: () => navigate('/profile') },
    { key: 'bookings', icon: <ProfileOutlined />, label: 'Đặt phòng của tôi', onClick: () => navigate('/bookings') },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      danger: true,
      onClick: async () => {
        await logout();
        message.success('Đã đăng xuất');
        navigate('/');
      },
    },
  ];

  const authButtons = (block) => (
    <>
      <Button block={block} onClick={() => navigate('/login')}>
        Đăng nhập
      </Button>
      <Button block={block} type="primary" onClick={() => navigate('/register')}>
        Đăng ký
      </Button>
    </>
  );

  const renderAccount = () => {
    if (loading) return <Skeleton.Button active size="small" />;
    if (!user) return isMobile ? null : <Space>{authButtons(false)}</Space>;
    return (
      <Dropdown
        menu={{ items: isCompact ? [{ key: 'name', label: user.full_name, disabled: true }, ...menuItems] : menuItems }}
        placement="bottomRight"
        trigger={['click']}
      >
        <Button type="text" style={{ height: 'auto', padding: '4px 8px' }}>
          <Space>
            <Avatar icon={<UserOutlined />} style={{ background: token.colorPrimary }} />
            {!isCompact && (
              <Typography.Text ellipsis style={{ maxWidth: 160 }}>
                {user.full_name}
              </Typography.Text>
            )}
          </Space>
        </Button>
      </Dropdown>
    );
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isCompact ? 8 : 16,
          padding: isCompact ? '0 12px' : '0 24px',
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: isCompact ? 8 : 24, minWidth: 0 }}>
          {isMobile && (
            <Button type="text" icon={<MenuOutlined />} aria-label="Mở menu" onClick={() => setDrawerOpen(true)} />
          )}
          <Link to="/" style={{ fontSize: 20, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {isNarrow && !isMobile ? '🏨' : '🏨 Hotel Booking'}
          </Link>
          {!isMobile && (
            <ConfigProvider theme={{ components: { Menu: { itemPaddingInline: isCompact ? 10 : 20 } } }}>
              <Menu
                mode="horizontal"
                disabledOverflow
                selectedKeys={[selectedKey]}
                items={navItems}
                style={{ borderBottom: 'none', minWidth: 0, flex: 1 }}
              />
            </ConfigProvider>
          )}
        </div>

        {renderAccount()}
      </Header>

      {isMobile && (
        <Drawer
          title="🏨 Hotel Booking"
          placement="left"
          width={260}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: 0 } }}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={navItems}
            onClick={() => setDrawerOpen(false)}
            style={{ borderInlineEnd: 'none' }}
          />
          {!loading && !user && (
            <Space direction="vertical" style={{ width: '100%', padding: 16 }}>
              {authButtons(true)}
            </Space>
          )}
        </Drawer>
      )}

      <Content>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
          <Outlet />
        </div>
      </Content>

      <Footer style={{ textAlign: 'center' }}>Hotel Booking © {new Date().getFullYear()}</Footer>
    </Layout>
  );
}
