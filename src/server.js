const express = require('express');
const cors = require('cors');
const path = require('path');
const { init } = require('./store');
const apiRoutes = require('./routes/api');
const orefPoller = require('./oref-poller');

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

// One-tap OK page (serves HTML with distinct green icon + title)
app.get('/ok/:memberId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/ok.html'));
});

// One-tap Trouble page (serves HTML with distinct red icon + title)
app.get('/trouble/:memberId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/trouble.html'));
});

init().then(() => {
  app.listen(PORT, () => {
    console.log(`Safe Circle running on http://localhost:${PORT}`);
    orefPoller.start();
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
