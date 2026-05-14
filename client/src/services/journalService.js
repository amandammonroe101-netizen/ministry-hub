import api from './api';

export const journalService = {
  getAll: () => api.get('/journal'),
  getOne: (id) => api.get(`/journal/${id}`),
  create: (data) => api.post('/journal', data),
  update: (id, data) => api.put(`/journal/${id}`, data),
  delete: (id) => api.delete(`/journal/${id}`),
};
