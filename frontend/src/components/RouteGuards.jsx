import { Navigate, useLocation } from 'react-router-dom';
import { Button, Result, Spin } from 'antd';
import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

function FullPageSpin() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '120px 0' }}>
      <Spin size="large" />
    </div>
  );
}

/** Only logged-in users may enter; otherwise redirect to /login and remember the intended page. */
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpin />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

/**
 * Only users whose role is in `roles` (default: admin).
 * This is only a UI layer; the backend is where permissions are really enforced.
 */
export function RoleRoute({ roles = ['admin'], children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpin />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!roles.includes(user.role)) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="Bạn không có quyền truy cập trang này."
        extra={
          <Link to="/">
            <Button type="primary">Về trang chủ</Button>
          </Link>
        }
      />
    );
  }
  return children;
}

/** Login/register pages: logged-in users are redirected to the home page. */
export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <FullPageSpin />;
  if (user) return <Navigate to="/" replace />;
  return children;
}
