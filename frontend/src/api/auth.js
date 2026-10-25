import api, { unwrap } from './client';

export const register = (payload) => unwrap(api.post('/auth/register', payload));

export const login = (payload) => unwrap(api.post('/auth/login', payload, { skipAuthEvent: true }));

export const logout = () => unwrap(api.post('/auth/logout', null, { skipAuthEvent: true }));

export const getProfile = () => unwrap(api.get('/auth/profile', { skipAuthEvent: true }));

export const updateProfile = (payload) => unwrap(api.put('/auth/profile', payload));

export const deleteAccount = () => unwrap(api.delete('/auth/profile'));
