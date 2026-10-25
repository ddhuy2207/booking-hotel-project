import api, { unwrap } from './client';

/** params: { page, per_page, is_active: 'true' | 'false' } */
export const listRoomTypes = (params) => unwrap(api.get('/admin/room-types', { params }));

/** payload: { name, description, price_per_night, max_guests }. */
export const createRoomType = (payload) => unwrap(api.post('/admin/room-types', payload));

/** Partial update. Send { is_active: true } to activate room type. */
export const updateRoomType = (id, payload) => unwrap(api.put(`/admin/room-types/${id}`, payload));

/** Soft delete */
export const deleteRoomType = (id) => unwrap(api.delete(`/admin/room-types/${id}`));

const UPLOAD_BATCH_BYTES = 20 * 1024 * 1024;

function splitIntoBatches(files) {
  const batches = [];
  let current = [];
  let size = 0;
  files.forEach((file) => {
    if (current.length > 0 && size + file.size > UPLOAD_BATCH_BYTES) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += file.size;
  });
  if (current.length > 0) batches.push(current);
  return batches;
}

export const uploadRoomTypeImages = async (id, files) => {
  let result;
  for (const batch of splitIntoBatches(files)) {
    const form = new FormData();
    batch.forEach((file) => form.append('images', file));
    result = await unwrap(api.post(`/admin/room-types/${id}/images`, form, { timeout: 120000 }));
  }
  return result;
};

/** DELETE /admin/room-types/:id/images with JSON body { image_urls: [...] } */
export const deleteRoomTypeImages = (id, urls) =>
  unwrap(api.delete(`/admin/room-types/${id}/images`, { data: { image_urls: urls } }));

/** params: { page, per_page, room_type_id, status } */
export const listRooms = (params) => unwrap(api.get('/admin/rooms', { params }));

/** payload: { room_number, room_type_id, status?: 'available' | 'maintenance' } */
export const createRoom = (payload) => unwrap(api.post('/admin/rooms', payload));

/** payload: { status?, room_type_id? } */
export const updateRoom = (id, payload) => unwrap(api.put(`/admin/rooms/${id}`, payload));

/** params: { check_in: 'YYYY-MM-DD', status, q, page, per_page }. Latest check-in date first. */
export const listBookings = (params) => unwrap(api.get('/admin/bookings', { params }));

/** Look up a booking by the code the guest provides. Returns { booking: {..., customer, paid} } or 404. */
export const lookupBooking = (code) => unwrap(api.get('/admin/bookings/lookup', { params: { code } }));

export const checkInBooking = (id) => unwrap(api.put(`/admin/bookings/${id}/check-in`));

export const checkOutBooking = (id) => unwrap(api.put(`/admin/bookings/${id}/check-out`));
