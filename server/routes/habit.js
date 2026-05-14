const express = require('express');
const router = express.Router();
const c = require('../controllers/habitController');

router.get('/', c.getAll);
router.post('/', c.create);
router.put('/:id', c.update);
router.delete('/:id', c.remove);
router.post('/:id/toggle', c.toggleCompletion);
router.post('/starter-pack', c.seedStarterPack);

module.exports = router;
