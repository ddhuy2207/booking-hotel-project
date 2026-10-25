import { Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from './components/AppLayout';
import { ProtectedRoute, PublicOnlyRoute, RoleRoute } from './components/RouteGuards';
import AdminBookingsPage from './pages/admin/AdminBookingsPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminRoomsPage from './pages/admin/AdminRoomsPage';
import AdminRoomTypesPage from './pages/admin/AdminRoomTypesPage';
import BookingDetailPage from './pages/BookingDetailPage';
import BookingPage from './pages/BookingPage';
import LoginPage from './pages/LoginPage';
import MyBookingsPage from './pages/MyBookingsPage';
import NotFoundPage from './pages/NotFoundPage';
import PaymentPage from './pages/PaymentPage';
import ProfilePage from './pages/ProfilePage';
import RegisterPage from './pages/RegisterPage';
import RoomDetailPage from './pages/RoomDetailPage';
import SearchPage from './pages/SearchPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<SearchPage />} />
        <Route path="rooms/:id" element={<RoomDetailPage />} />

        <Route path="login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
        <Route path="register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />

        {/* The pages below require login */}
        <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="booking/new" element={<ProtectedRoute><BookingPage /></ProtectedRoute>} />
        <Route path="bookings" element={<ProtectedRoute><MyBookingsPage /></ProtectedRoute>} />
        <Route path="bookings/:id" element={<ProtectedRoute><BookingDetailPage /></ProtectedRoute>} />
        <Route path="bookings/:id/pay" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />

        {/* Admin: the backend is where permissions are really enforced; this only hides the UI */}
        <Route path="admin" element={<RoleRoute roles={['admin', 'staff']}><AdminLayout /></RoleRoute>}>
          <Route index element={<Navigate to="bookings" replace />} />
          <Route path="bookings" element={<AdminBookingsPage />} />
          <Route path="rooms" element={<AdminRoomsPage />} />
          <Route path="room-types" element={<RoleRoute roles={['admin']}><AdminRoomTypesPage /></RoleRoute>} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
