const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { stmts } = require('../store');

const router = express.Router();

// --- Circles ---

router.get('/circles', (req, res) => {
  res.json(stmts.getCircles.all());
});

router.post('/circles', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  stmts.insertCircle.run(id, name, createdAt);
  res.status(201).json({ id, name, createdAt });
});

router.delete('/circles/:id', (req, res) => {
  const circleId = req.params.id;
  stmts.deleteResponsesByCircleEvents.run(circleId);
  stmts.deleteEventsByCircle.run(circleId);
  stmts.deleteMembersByCircle.run(circleId);
  stmts.deleteCircle.run(circleId);
  res.json({ ok: true });
});

// --- Members ---

router.get('/circles/:circleId/members', (req, res) => {
  res.json(stmts.getMembers.all(req.params.circleId));
});

router.post('/circles/:circleId/members', (req, res) => {
  const { name, email, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const circle = stmts.getCircle.get(req.params.circleId);
  if (!circle) return res.status(404).json({ error: 'Circle not found' });

  const id = uuidv4();
  const createdAt = new Date().toISOString();
  stmts.insertMember.run(id, name, email || '', phone || '', req.params.circleId, createdAt);
  res.status(201).json({ id, name, email: email || '', phone: phone || '', circleId: req.params.circleId, createdAt });
});

router.put('/members/:id', (req, res) => {
  const { name, email, phone } = req.body;
  const member = stmts.getMember.get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  stmts.updateMember.run(name || member.name, email ?? member.email, phone ?? member.phone, req.params.id);
  res.json({ ...member, name: name || member.name, email: email ?? member.email, phone: phone ?? member.phone });
});

router.delete('/members/:id', (req, res) => {
  stmts.deleteResponsesByMember.run(req.params.id);
  stmts.deleteMember.run(req.params.id);
  res.json({ ok: true });
});

// --- Events (alert check-ins) ---

router.get('/circles/:circleId/events', (req, res) => {
  res.json(stmts.getEvents.all(req.params.circleId));
});

// Start a new check-in event
router.post('/circles/:circleId/events', (req, res) => {
  const circle = stmts.getCircle.get(req.params.circleId);
  if (!circle) return res.status(404).json({ error: 'Circle not found' });

  // End any active events
  stmts.endActiveEvents.run(new Date().toISOString(), req.params.circleId);

  const id = uuidv4();
  const createdAt = new Date().toISOString();
  stmts.insertEvent.run(id, req.params.circleId, createdAt);
  res.status(201).json({ id, circleId: req.params.circleId, active: 1, createdAt });
});

// End an event
router.post('/events/:id/end', (req, res) => {
  const event = stmts.getEvent.get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  stmts.endEvent.run(new Date().toISOString(), req.params.id);
  res.json({ ...event, active: 0, endedAt: new Date().toISOString() });
});

// Get active event status (for dashboard polling)
router.get('/circles/:circleId/status', (req, res) => {
  const circleId = req.params.circleId;
  const members = stmts.getMembers.all(circleId);
  const activeEvent = stmts.getActiveEvent.get(circleId);

  if (!activeEvent) {
    return res.json({ active: false, members: members.map((m) => ({ id: m.id, name: m.name })) });
  }

  const responses = stmts.getResponses.all(activeEvent.id);
  const responseMap = {};
  responses.forEach((r) => { responseMap[r.memberId] = r; });

  const status = members.map((m) => {
    const response = responseMap[m.id];
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
  const member = stmts.getMember.get(req.params.memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json({ id: member.id, name: member.name, circleId: member.circleId });
});

// Check in (API endpoint for fetch-based check-in)
router.post('/checkin/:memberId', (req, res) => {
  const { status } = req.body;
  if (!['ok', 'trouble'].includes(status)) {
    return res.status(400).json({ error: 'Status must be ok or trouble' });
  }

  const member = stmts.getMember.get(req.params.memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const activeEvent = stmts.getActiveEvent.get(member.circleId);
  if (!activeEvent) {
    return res.status(400).json({ error: 'No active check-in event' });
  }

  stmts.upsertResponse.run(activeEvent.id, member.id, status, new Date().toISOString());
  res.json({ ok: true, status });
});

module.exports = router;
