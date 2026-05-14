import api from './api';
export const habitService = {
  getAll:       ()             => api.get('/habits'),
  create:       (data)         => api.post('/habits', data),
  update:       (id, data)     => api.put(`/habits/${id}`, data),
  delete:       (id)           => api.delete(`/habits/${id}`),
  toggle:       (id, date)     => api.post(`/habits/${id}/toggle`, { date }),
  seedStarter:  ()             => api.post('/habits/starter-pack'),
};
