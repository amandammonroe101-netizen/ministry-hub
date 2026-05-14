import api from './api';
export const prayerService = {
  getAll:     ()                  => api.get('/prayer'),
  getOne:     (id)                => api.get(`/prayer/${id}`),
  create:     (data)              => api.post('/prayer', data),
  update:     (id, data)          => api.put(`/prayer/${id}`, data),
  delete:     (id)                => api.delete(`/prayer/${id}`),
  addUpdate:  (id, data)          => api.post(`/prayer/${id}/updates`, data),
  setFriends: (id, friend_ids)    => api.put(`/prayer/${id}/friends`, { friend_ids }),
};
