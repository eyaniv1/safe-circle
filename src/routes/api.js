const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db, save } = require('../store');

const router = express.Router();

// --- Circles ---

router.get('/circles', (req, res) => {
  res.json(Object.values(db.circles));
});

router.post('/circles', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const circle = { id: uuidv4(), name, createdAt: new Date().toISOString() };
  db.circles[circle.id] = circle;
  save(db);
  res.status(201).json(circle);
});

router.delete('/circles/:id', (req, res) => {
  delete db.circles[req.params.id];
  // Clean up members and events in this circle
  Object.values(db.members).forEach((m) => {
    if (m.circleId === req.params.id) delete db.members[m.id];
  });
  Object.values(db.events).forEach((e) => {
    if (e.circleId === req.params.id) delete db.events[e.id];
  });
  save(db);
  res.json({ ok: true });
});

// --- Members ---

router.get('/circles/:circleId/members', (req, res) => {
  const members = Object.values(db.members).filter(
    (m) => m.circleId === req.params.circleId
  );
  res.json(members);
});

router.post('/circles/:circleId/members', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const circle = db.circles[req.params.circleId];
  if (!circle) return res.status(404).json({ error: 'Circle not found' });

  const member = {
    id: uuidv4(),
    name,
    circleId: req.params.circleId,
    createdAt: new Date().toISOString(),
  };
  db.members[member.id] = member;
  save(db);
  res.status(201).json(member);
});

router.delete('/members/:id', (req, res) => {
  delete db.members[req.params.id];
  save(db);
  res.json({ ok: true });
});

// --- Events (alert check-ins) ---

router.get('/circles/:circleId/events', (req, res) => {
  const events = Object.values(db.events)
    .filter((e) => e.circleId === req.params.circleId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(events);
});

// Start a new check-in event
router.post('/circles/:circleId/events', (req, res) => {
  const circle = db.circles[req.params.circleId];
  if (!circle) return res.status(404).json({ error: 'Circle not found' });

  // End any active events for this circle
  Object.values(db.events).forEach((e) => {
    if (e.circleId === req.params.circleId && e.active) {
      e.active = false;
      e.endedAt = new Date().toISOString();
    }
  });

  const event = {
    id: uuidv4(),
    circleId: req.params.circleId,
    active: true,
    responses: {},
    createdAt: new Date().toISOString(),
  };
  db.events[event.id] = event;
  save(db);
  res.status(201).json(event);
});

// End an event
router.post('/events/:id/end', (req, res) => {
  const event = db.events[req.params.id];
  if (!event) return res.status(404).json({ error: 'Event not found' });
  event.active = false;
  event.endedAt = new Date().toISOString();
  save(db);
  res.json(event);
});

// Get active event status (for dashboard polling)
router.get('/circles/:circleId/status', (req, res) => {
  const circleId = req.params.circleId;
  const members = Object.values(db.members).filter((m) => m.circleId === circleId);
  const activeEvent = Object.values(db.events).find(
    (e) => e.circleId === circleId && e.active
  );

  if (!activeEvent) {
    return res.json({ active: false, members: members.map((m) => ({ id: m.id, name: m.name })) });
  }

  const status = members.map((m) => {
    const response = activeEvent.responses[m.id];
    return {
      id: m.id,
      name: m.name,
      status: response ? response.status : 'unknown',
      time: response ? response.time : null,
    };
  });

  res.json({
    active: true,
    eventId: activeEvent.id,
    startedAt: activeEvent.createdAt,
    members: status,
  });
});

// Get member info (for check-in page)
router.get('/member-info/:memberId', (req, res) => {
  const member = db.members[req.params.memberId];
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json({ id: member.id, name: member.name, circleId: member.circleId });
});

// Check in (API endpoint for fetch-based check-in)
router.post('/checkin/:memberId', (req, res) => {
  const { status } = req.body;
  if (!['ok', 'trouble'].includes(status)) {
    return res.status(400).json({ error: 'Status must be ok or trouble' });
  }

  const member = db.members[req.params.memberId];
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const activeEvent = Object.values(db.events).find(
    (e) => e.circleId === member.circleId && e.active
  );

  if (!activeEvent) {
    return res.status(400).json({ error: 'No active check-in event' });
  }

  activeEvent.responses[member.id] = { status, time: new Date().toISOString() };
  save(db);
  res.json({ ok: true, status });
});

module.exports = router;
