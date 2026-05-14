const express = require('express');
const router = express.Router();
const c = require('../controllers/prayerController');

router.get('/', c.getAll);
router.get('/:id', c.getOne);
router.post('/', c.create);
router.put('/:id', c.update);
router.delete('/:id', c.remove);
router.post('/:id/updates', c.addUpdate);
router.put('/:id/friends', c.setFriends);

module.exports = router;
