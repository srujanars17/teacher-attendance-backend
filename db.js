const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'attendance.db');

function connect() {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('SQLite open error', err);
  });
  return db;
}

module.exports = { connect, dbPath };
