import api from './api';
export const calendarService = {
  getAll: ()             => api.get('/calendar'),
  create: (data)         => api.post('/calendar', data),
  update: (id, data)     => api.put(`/calendar/${id}`, data),
  delete: (id)           => api.delete(`/calendar/${id}`),
};
