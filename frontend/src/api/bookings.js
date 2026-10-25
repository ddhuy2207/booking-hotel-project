import api, { unwrap } from './client';

export const createBooking = (payload) => unwrap(api.post('/bookings', payload));

export const getMyBookings = () => unwrap(api.get('/bookings/my'));

export const getBooking = (id) => unwrap(api.get(`/bookings/${id}`));

export const cancelBooking = (id) => unwrap(api.put(`/bookings/${id}/cancel`));
