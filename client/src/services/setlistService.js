import api from './api';

export const setlistService = {
  getAll:        ()                    => api.get('/setlists'),
  getOne:        (id)                  => api.get(`/setlists/${id}`),
  create:        (data)                => api.post('/setlists', data),
  update:        (id, data)            => api.put(`/setlists/${id}`, data),
  delete:        (id)                  => api.delete(`/setlists/${id}`),
  addSong:       (id, song_id, notes)  => api.post(`/setlists/${id}/songs`, { song_id, notes }),
  removeSong:    (id, linkId)          => api.delete(`/setlists/${id}/songs/${linkId}`),
  reorderSongs:  (id, order)           => api.put(`/setlists/${id}/songs-order`, { order }),
};
