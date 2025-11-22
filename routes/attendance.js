// routes/attendance.js
const express = require('express');
const router = express.Router();
const { connect } = require('../db');
const dayjs = require('dayjs');
const metrics = require('../metrics');

function instrument(routeName, handler) {
  return (req, res) => {
    const end = metrics.httpDuration.startTimer({ method: req.method, route: routeName, status: '200' });
    try {
      handler(req, res);
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      metrics.httpRequestsTotal.inc({ method: req.method, route: routeName, status: res.statusCode });
      end({ status: res.statusCode });
    }
  };
}

router.get('/summary', instrument('/summary', (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const db = connect();
  const totalQ = `SELECT COUNT(*) as total FROM teachers`;
  const presentQ = `SELECT COUNT(DISTINCT teacher_id) as present FROM biometric_logs WHERE date(ts)=?`;
  const leaveQ = `SELECT COUNT(DISTINCT teacher_id) as on_leave FROM leave_records WHERE date(start_date) <= ? AND date(end_date) >= ?`;

  db.get(totalQ, [], (err, tRow) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(presentQ, [today], (err, pRow) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(leaveQ, [today, today], (err, lRow) => {
        if (err) return res.status(500).json({ error: err.message });
        const total = tRow.total || 0;
        const present = pRow.present || 0;
        const on_leave = lRow.on_leave || 0;
        const absent = Math.max(0, total - present - on_leave);
        metrics.presentGauge.set(present);
        res.json({ total, present, absent, on_leave });
      });
    });
  });
}));

router.get('/details', instrument('/details', (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const db = connect();
  const q = `
    SELECT t.teacher_id, t.name, t.department,
    CASE
      WHEN EXISTS (SELECT 1 FROM leave_records l WHERE l.teacher_id=t.teacher_id AND date(l.start_date)<=? AND date(l.end_date)>=?) THEN 'On Leave'
      WHEN EXISTS (SELECT 1 FROM biometric_logs b WHERE b.teacher_id=t.teacher_id AND date(b.ts)=?) THEN 'Present'
      ELSE 'Absent'
    END as status
    FROM teachers t
    ORDER BY t.department, t.name
  `;
  db.all(q, [today, today, today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
}));

router.get('/history', instrument('/history', (req, res) => {
  let days = parseInt(req.query.days || '14', 10);
  if (isNaN(days) || days < 1) days = 14;
  const db = connect();
  const now = dayjs();
  const result = [];
  let pending = days + 1;
  for (let i = days; i >= 0; i--) {
    const d = now.subtract(i, 'day').format('YYYY-MM-DD');
    const presentQ = `SELECT COUNT(DISTINCT teacher_id) as present FROM biometric_logs WHERE date(ts)=?`;
    const leaveQ = `SELECT COUNT(DISTINCT teacher_id) as on_leave FROM leave_records WHERE date(start_date) <= ? AND date(end_date) >= ?`;
    const totalQ = `SELECT COUNT(*) as total FROM teachers`;
    db.get(presentQ, [d], (err, pRow) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(leaveQ, [d, d], (err, lRow) => {
        if (err) return res.status(500).json({ error: err.message });
        db.get(totalQ, [], (err, tRow) => {
          if (err) return res.status(500).json({ error: err.message });
          const total = tRow.total || 0;
          const present = pRow.present || 0;
          const on_leave = lRow.on_leave || 0;
          const absent = Math.max(0, total - present - on_leave);
          result.push({ date: d, total, present, absent, on_leave });
          pending--;
          if (pending === 0) {
            result.sort((a,b)=>a.date.localeCompare(b.date));
            res.json(result);
          }
        });
      });
    });
  }
}));

// simulate-scan (POST) - add a new 'in' record for a teacher (teacher query param)
router.post('/simulate-scan', instrument('/simulate-scan', (req, res) => {
  const teacher = req.query.teacher;
  if (!teacher) return res.status(400).json({ error: 'teacher query param required e.g. ?teacher=T1001' });
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const db = connect();
  db.run(`INSERT INTO biometric_logs (teacher_id, ts, status, device_id) VALUES (?, ?, 'in', 'SIM-1')`, [teacher, ts], function(err){
    if (err) return res.status(500).json({ error: err.message });
    // update gauge
    const today = dayjs().format('YYYY-MM-DD');
    db.get(`SELECT COUNT(DISTINCT teacher_id) as present FROM biometric_logs WHERE date(ts)=?`, [today], (err, row) => {
      if (!err) metrics.presentGauge.set(row.present || 0);
      res.json({ ok: true, teacher, ts });
    });
  });
}));

module.exports = router;
