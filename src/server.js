const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api', apiRoutes);

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// Serve member check-in page
app.get('/checkin/:memberId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/checkin.html'));
});

// Direct one-tap OK endpoint (for home screen shortcut)
app.get('/ok/:memberId', (req, res) => {
  const { db, save } = require('./store');
  const member = db.members[req.params.memberId];
  if (!member) return res.status(404).send('Member not found');

  const activeEvent = Object.values(db.events).find(
    (e) => e.circleId === member.circleId && e.active
  );
  if (activeEvent) {
    activeEvent.responses[member.id] = { status: 'ok', time: new Date().toISOString() };
    save(db);
  }
  res.redirect(`/checkin/${member.id}?confirmed=ok`);
});

// Direct one-tap Trouble endpoint
app.get('/trouble/:memberId', (req, res) => {
  const { db, save } = require('./store');
  const member = db.members[req.params.memberId];
  if (!member) return res.status(404).send('Member not found');

  const activeEvent = Object.values(db.events).find(
    (e) => e.circleId === member.circleId && e.active
  );
  if (activeEvent) {
    activeEvent.responses[member.id] = { status: 'trouble', time: new Date().toISOString() };
    save(db);
  }
  res.redirect(`/checkin/${member.id}?confirmed=trouble`);
});

app.listen(PORT, () => {
  console.log(`Safe Circle running on http://localhost:${PORT}`);
});
