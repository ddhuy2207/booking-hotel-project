import api, { unwrap } from './client';

/**
 * params: { check_in, check_out, guests, min_price, max_price, sort, page, per_page }
*/
export const searchRooms = (params) => unwrap(api.get('/rooms/search', { params }));

/** params (optional): { check_in, check_out } as "YYYY-MM-DD"; if given, the response includes an "availability" section */
export const getRoomType = (id, params) => unwrap(api.get(`/rooms/${id}`, { params }));
