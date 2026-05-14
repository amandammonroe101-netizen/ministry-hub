const express = require('express');
const router = express.Router();
const c = require('../controllers/studioProjectController');

router.get('/',                          c.getAll);
router.get('/:id',                       c.getOne);
router.post('/',                         c.create);
router.put('/:id',                       c.update);
router.delete('/:id',                    c.remove);

router.post('/:id/tracks',               c.addTrack);
router.put('/:id/tracks/:trackId',       c.updateTrack);
router.delete('/:id/tracks/:trackId',    c.removeTrack);

module.exports = router;
