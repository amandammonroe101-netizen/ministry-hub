const express = require('express');
const router = express.Router();
const c = require('../controllers/setlistController');

router.get('/',                          c.getAll);
router.get('/:id',                       c.getOne);
router.post('/',                         c.create);
router.put('/:id',                       c.update);
router.delete('/:id',                    c.remove);

router.post('/:id/songs',                c.addSong);
router.delete('/:id/songs/:linkId',      c.removeSong);
router.put('/:id/songs-order',           c.reorderSongs);

module.exports = router;
