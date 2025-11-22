// index.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const attendanceRoutes = require('./routes/attendance');
const metrics = require('./metrics');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('tiny'));

app.get('/', (req, res) => res.send('Teacher Attendance Backend'));

app.use('/api', attendanceRoutes);

// metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
