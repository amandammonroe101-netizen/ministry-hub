import api from './api';

export const studioProjectService = {
  getAll:       ()                    => api.get('/studio-projects'),
  getOne:       (id)                  => api.get(`/studio-projects/${id}`),
  create:       (data)                => api.post('/studio-projects', data),
  update:       (id, data)            => api.put(`/studio-projects/${id}`, data),
  delete:       (id)                  => api.delete(`/studio-projects/${id}`),
  addTrack:     (id, data)            => api.post(`/studio-projects/${id}/tracks`, data),
  updateTrack:  (id, trackId, data)   => api.put(`/studio-projects/${id}/tracks/${trackId}`, data),
  removeTrack:  (id, trackId)         => api.delete(`/studio-projects/${id}/tracks/${trackId}`),
};
