const express = require('express');
const router = express.Router();
const c = require('../controllers/journalReminderController');

router.get('/', c.getAll);
router.post('/', c.create);
router.delete('/:id', c.remove);

module.exports = router;
