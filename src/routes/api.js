const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../store');

const router = express.Router();

// --- Circles ---

router.get('/circles', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM circles ORDER BY created_at');
  res.json(rows);
});

router.post('/circles', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  const { rows } = await pool.query(
    'INSERT INTO circles (id, name) VALUES ($1, $2) RETURNING *', [id, name]
  );
  res.status(201).json(rows[0]);
});

router.put('/circles/:id', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const { rows } = await pool.query(
    'UPDATE circles SET name = $1 WHERE id = $2 RETURNING *', [name, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Circle not found' });
  res.json(rows[0]);
});

router.delete('/circles/:id', async (req, res) => {
  await pool.query('DELETE FROM circles WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// --- Members ---

router.get('/circles/:circleId/members', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM members WHERE circle_id = $1 ORDER BY created_at', [req.params.circleId]
  );
  res.json(rows);
});

router.post('/circles/:circleId/members', async (req, res) => {
  const { name, email, phone, area } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const circle = await pool.query('SELECT id FROM circles WHERE id = $1', [req.params.circleId]);
  if (circle.rows.length === 0) return res.status(404).json({ error: 'Circle not found' });

  const id = uuidv4();
  const { rows } = await pool.query(
    'INSERT INTO members (id, name, email, phone, area, circle_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [id, name, email || '', phone || '', area || '', req.params.circleId]
  );
  res.status(201).json(rows[0]);
});

router.put('/members/:id', async (req, res) => {
  const { name, email, phone, area } = req.body;
  const member = await pool.query('SELECT * FROM members WHERE id = $1', [req.params.id]);
  if (member.rows.length === 0) return res.status(404).json({ error: 'Member not found' });

  const m = member.rows[0];
  const { rows } = await pool.query(
    'UPDATE members SET name = $1, email = $2, phone = $3, area = $4 WHERE id = $5 RETURNING *',
    [name || m.name, email ?? m.email, phone ?? m.phone, area ?? m.area, req.params.id]
  );
  res.json(rows[0]);
});

router.delete('/members/:id', async (req, res) => {
  await pool.query('DELETE FROM members WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Get aggregated areas for a circle
router.get('/circles/:circleId/areas', async (req, res) => {
  const { rows } = await pool.query(
    "SELECT DISTINCT area FROM members WHERE circle_id = $1 AND area != ''", [req.params.circleId]
  );
  res.json(rows.map(r => r.area));
});

// --- Events (alert check-ins) ---

router.get('/circles/:circleId/events', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM events WHERE circle_id = $1 ORDER BY created_at DESC', [req.params.circleId]
  );
  res.json(rows);
});

router.post('/circles/:circleId/events', async (req, res) => {
  const circle = await pool.query('SELECT id FROM circles WHERE id = $1', [req.params.circleId]);
  if (circle.rows.length === 0) return res.status(404).json({ error: 'Circle not found' });

  // End active events
  await pool.query(
    'UPDATE events SET active = false, ended_at = NOW() WHERE circle_id = $1 AND active = true',
    [req.params.circleId]
  );

  const id = uuidv4();
  const { rows } = await pool.query(
    'INSERT INTO events (id, circle_id) VALUES ($1, $2) RETURNING *', [id, req.params.circleId]
  );
  res.status(201).json(rows[0]);
});

router.post('/events/:id/end', async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE events SET active = false, ended_at = NOW() WHERE id = $1 RETURNING *', [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Event not found' });
  res.json(rows[0]);
});

// Get active event status
router.get('/circles/:circleId/status', async (req, res) => {
  const circleId = req.params.circleId;
  const members = await pool.query(
    'SELECT * FROM members WHERE circle_id = $1 ORDER BY created_at', [circleId]
  );
  const activeEvent = await pool.query(
    'SELECT * FROM events WHERE circle_id = $1 AND active = true LIMIT 1', [circleId]
  );

  if (activeEvent.rows.length === 0) {
    return res.json({
      active: false,
      members: members.rows.map((m) => ({ id: m.id, name: m.name })),
    });
  }

  const event = activeEvent.rows[0];
  const triggeredAreas = event.triggered_areas ? event.triggered_areas.split(',') : [];
  const responses = await pool.query(
    'SELECT * FROM responses WHERE event_id = $1', [event.id]
  );
  const responseMap = {};
  responses.rows.forEach((r) => { responseMap[r.member_id] = r; });

  const status = members.rows.map((m) => {
    const response = responseMap[m.id];
    // Check if member's area is in the triggered alert zones
    const inAlertZone = triggeredAreas.length === 0 || !m.area ||
      triggeredAreas.some(a => a.includes(m.area) || m.area.includes(a));
    return {
      id: m.id,
      name: m.name,
      area: m.area || '',
      inAlertZone,
      status: response ? response.status : 'unknown',
      time: response ? response.time : null,
    };
  });

  res.json({
    active: true,
    eventId: event.id,
    startedAt: event.created_at,
    triggeredAreas,
    members: status,
  });
});

// Get member info (also marks setup page as visited)
router.get('/member-info/:memberId', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM members WHERE id = $1', [req.params.memberId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Member not found' });
  // Mark as visited
  await pool.query('UPDATE members SET setup_visited = true WHERE id = $1', [req.params.memberId]);
  res.json({ id: rows[0].id, name: rows[0].name, circleId: rows[0].circle_id });
});

// Check in
router.post('/checkin/:memberId', async (req, res) => {
  const { status } = req.body;
  if (!['ok', 'trouble'].includes(status)) {
    return res.status(400).json({ error: 'Status must be ok or trouble' });
  }

  const member = await pool.query('SELECT * FROM members WHERE id = $1', [req.params.memberId]);
  if (member.rows.length === 0) return res.status(404).json({ error: 'Member not found' });

  const m = member.rows[0];
  const activeEvent = await pool.query(
    'SELECT * FROM events WHERE circle_id = $1 AND active = true LIMIT 1', [m.circle_id]
  );
  if (activeEvent.rows.length === 0) {
    return res.status(400).json({ error: 'No active check-in event' });
  }

  await pool.query(
    `INSERT INTO responses (event_id, member_id, status, time)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (event_id, member_id) DO UPDATE SET status = $3, time = NOW()`,
    [activeEvent.rows[0].id, m.id, status]
  );

  // Track which shortcuts the member has used
  const col = status === 'ok' ? 'ok_clicked' : 'trouble_clicked';
  await pool.query(`UPDATE members SET ${col} = true WHERE id = $1`, [m.id]);

  res.json({ ok: true, status });
});

module.exports = router;
