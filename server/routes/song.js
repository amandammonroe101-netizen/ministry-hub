const express = require('express');
const router = express.Router();
const c = require('../controllers/songController');

router.get('/', c.getAll);
router.get('/:id', c.getOne);
router.post('/', c.create);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

router.post('/:id/sections',                       c.addSection);
router.post('/:id/sections/:sectionId/duplicate',  c.duplicateSection);
router.put('/:id/sections/:sectionId',             c.updateSection);
router.delete('/:id/sections/:sectionId',          c.removeSection);
router.put('/:id/sections-order',                  c.reorderSections);

router.post('/:id/recordings',                c.addRecording);
router.get('/:id/recordings/:recordingId',    c.getRecording);
router.delete('/:id/recordings/:recordingId', c.removeRecording);

module.exports = router;
