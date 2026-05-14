import api from './api';
export const journalReminderService = {
  getAll: ()         => api.get('/journal-reminders'),
  create: (data)     => api.post('/journal-reminders', data),
  delete: (id)       => api.delete(`/journal-reminders/${id}`),
};
