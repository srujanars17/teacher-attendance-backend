# teacher-attendance-backend
Node.js + Express backend for tracking teacher attendance. Seeds data from a CSV into SQLite (attendance.db) and exposes RESTful APIs under /api. Includes Prometheus metrics for Grafana dashboards. Auto-seeds on startup if DB is missing. Deployable on Render with npm install and node index.js.
