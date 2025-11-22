// seed-from-csv.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const dayjs = require('dayjs');
const sqlite3 = require('sqlite3').verbose();

const csvPath = path.join(__dirname, 'data', 'teacher_attendance.csv');
const dbPath = path.join(__dirname, 'data', 'attendance.db');

// Remove old DB (optional)
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('Removed old DB');
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id TEXT UNIQUE,
    name TEXT,
    department TEXT
  )`);

  db.run(`CREATE TABLE leave_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id TEXT,
    start_date TEXT,
    end_date TEXT,
    reason TEXT
  )`);

  db.run(`CREATE TABLE biometric_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id TEXT,
    ts TEXT,
    status TEXT,
    device_id TEXT
  )`);

  const teachersSet = new Map();

  // CSV is expected to have columns: teacher_id,name,department,date,status (status values like present/absent/leave)
  const attendanceRows = [];
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (row) => attendanceRows.push(row))
    .on('end', () => {
      console.log('Loaded CSV rows:', attendanceRows.length);

      // Insert unique teachers
      attendanceRows.forEach(r => {
        const tid = (r.teacher_id || r.teacher || r.id || '').toString();
        if (!tid) return;
        if (!teachersSet.has(tid)) {
          const name = r.name || `Teacher-${tid}`;
          const dept = r.department || 'General';
          teachersSet.set(tid, { teacher_id: tid, name, department: dept });
        }
      });

      const insertT = db.prepare(`INSERT INTO teachers (teacher_id, name, department) VALUES (?, ?, ?)`);
      for (const t of teachersSet.values()) insertT.run(t.teacher_id, t.name, t.department);
      insertT.finalize();

      // For each attendance row, if present -> create in/out logs
      const insertLog = db.prepare(`INSERT INTO biometric_logs (teacher_id, ts, status, device_id) VALUES (?, ?, ?, ?)`);
      attendanceRows.forEach(r => {
        const tid = (r.teacher_id || r.teacher || r.id || '').toString();
        const dateStr = (r.date || r.timestamp || r.attendance_date || '').toString();
        const status = (r.status || r.att_status || '').toString().toLowerCase();

        if (!tid || !dateStr) return;

        const base = dayjs(dateStr);
        if (!base.isValid()) return;

        if (status.includes('present') || status === '1' || status === 'p') {
          // generate an 'in' around 08:00 - 09:30 and 'out' around 14:00 - 16:00
          const inHour = 8 + Math.floor(Math.random() * 2);
          const inMin = Math.floor(Math.random() * 60);
          const inTs = base.hour(inHour).minute(inMin).second(0).format('YYYY-MM-DD HH:mm:ss');
          insertLog.run(tid, inTs, 'in', `D-${1 + Math.floor(Math.random()*3)}`);

          const outHour = 14 + Math.floor(Math.random() * 3);
          const outMin = Math.floor(Math.random() * 60);
          const outTs = base.hour(outHour).minute(outMin).second(0).format('YYYY-MM-DD HH:mm:ss');
          insertLog.run(tid, outTs, 'out', `D-${1 + Math.floor(Math.random()*3)}`);
        } else if (status.includes('leave') || status.includes('on leave')) {
          // mark leave record for that date
          const insertLeave = db.prepare(`INSERT INTO leave_records (teacher_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)`);
          const d = base.format('YYYY-MM-DD');
          insertLeave.run(tid, d, d, 'dataset-leave');
          insertLeave.finalize();
        } else {
          // absent -> no log
        }
      });

      insertLog.finalize(() => {
        console.log('Seeding complete. DB path:', dbPath);
        db.close();
      });
    });
})