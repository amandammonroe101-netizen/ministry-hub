const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./config/db');
const journalRoutes  = require('./routes/journal');
const prayerRoutes   = require('./routes/prayer');
const friendsRoutes  = require('./routes/friends');
const calendarRoutes        = require('./routes/calendar');
const habitRoutes           = require('./routes/habit');
const journalReminderRoutes = require('./routes/journalReminder');
const songRoutes            = require('./routes/song');
const setlistRoutes         = require('./routes/setlist');
const studioProjectRoutes   = require('./routes/studioProject');

const app = express();
const PORT = process.env.PORT || 5000;
const isDev = process.env.NODE_ENV === 'development';

if (isDev) {
  app.use(cors({ origin: 'http://localhost:5173' }));
} else {
  app.use(cors());
}

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use('/api/journal',  journalRoutes);
app.use('/api/prayer',   prayerRoutes);
app.use('/api/friends',  friendsRoutes);
app.use('/api/calendar',          calendarRoutes);
app.use('/api/habits',            habitRoutes);
app.use('/api/journal-reminders', journalReminderRoutes);
app.use('/api/songs',             songRoutes);
app.use('/api/setlists',          setlistRoutes);
app.use('/api/studio-projects',   studioProjectRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

if (!isDev) {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

initDb().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
