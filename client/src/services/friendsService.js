import api from './api';
export const friendsService = {
  getFriends:          ()              => api.get('/friends/list'),
  addFriend:           (data)          => api.post('/friends/list', data),
  getFriendDetail:     (id)            => api.get(`/friends/list/${id}`),
  updateFriend:        (id, data)      => api.put(`/friends/list/${id}`, data),
  removeFriend:        (id)            => api.delete(`/friends/list/${id}`),
  addFriendPrayer:     (id, data)      => api.post(`/friends/list/${id}/prayers`, data),
  updateFriendPrayer:  (id, pid, data) => api.put(`/friends/list/${id}/prayers/${pid}`, data),
  addTimeline:         (id, data)      => api.post(`/friends/list/${id}/timeline`, data),
  addFriendEvent:      (id, data)      => api.post(`/friends/list/${id}/events`, data),
  getCommunityPrayers: ()              => api.get('/friends/community'),
  addCommunityPrayer:  (data)          => api.post('/friends/community', data),
  togglePraying:       (id)            => api.post(`/friends/community/${id}/pray`),
  getEvents:           ()              => api.get('/friends/events'),
  addEvent:            (data)          => api.post('/friends/events', data),
  toggleJoining:       (id)            => api.post(`/friends/events/${id}/join`),
};
