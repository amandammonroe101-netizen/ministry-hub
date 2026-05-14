import api from './api';

export const songService = {
  getAll:           ()                          => api.get('/songs'),
  getOne:           (id)                        => api.get(`/songs/${id}`),
  create:           (data)                      => api.post('/songs', data),
  update:           (id, data)                  => api.put(`/songs/${id}`, data),
  delete:           (id)                        => api.delete(`/songs/${id}`),

  addSection:       (id, data)                  => api.post(`/songs/${id}/sections`, data),
  duplicateSection: (id, sectionId)             => api.post(`/songs/${id}/sections/${sectionId}/duplicate`),
  updateSection:    (id, sectionId, data)       => api.put(`/songs/${id}/sections/${sectionId}`, data),
  removeSection:    (id, sectionId)             => api.delete(`/songs/${id}/sections/${sectionId}`),
  reorderSections:  (id, order)                 => api.put(`/songs/${id}/sections-order`, { order }),

  addRecording:     (id, data)                  => api.post(`/songs/${id}/recordings`, data),
  getRecording:     (id, recordingId)           => api.get(`/songs/${id}/recordings/${recordingId}`),
  removeRecording:  (id, recordingId)           => api.delete(`/songs/${id}/recordings/${recordingId}`),
};
