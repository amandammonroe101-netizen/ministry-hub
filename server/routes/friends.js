const express = require('express');
const router = express.Router();
const c = require('../controllers/friendsController');

router.get('/list', c.getFriends);
router.post('/list', c.addFriend);
router.get('/list/:id', c.getFriendDetail);
router.put('/list/:id', c.updateFriend);
router.delete('/list/:id', c.removeFriend);

router.post('/list/:id/prayers', c.addFriendPrayer);
router.put('/list/:id/prayers/:prayerId', c.updateFriendPrayer);
router.post('/list/:id/timeline', c.addTimeline);
router.post('/list/:id/events', c.addFriendEvent);

router.get('/community', c.getCommunityPrayers);
router.post('/community', c.addCommunityPrayer);
router.post('/community/:id/pray', c.togglePraying);

router.get('/events', c.getEvents);
router.post('/events', c.addEvent);
router.post('/events/:id/join', c.toggleJoining);

module.exports = router;
