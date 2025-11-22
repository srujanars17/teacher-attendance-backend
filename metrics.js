// metrics.js
const client = require('prom-client');
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'ta_' });

const httpRequestsTotal = new client.Counter({
  name: 'ta_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});
const httpDuration = new client.Histogram({
  name: 'ta_http_request_duration_seconds',
  help: 'HTTP request duration seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
const presentGauge = new client.Gauge({
  name: 'ta_present_count',
  help: 'Teachers present today'
});

register.registerMetric(httpRequestsTotal);
register.registerMetric(httpDuration);
register.registerMetric(presentGauge);

module.exports = { client, register, httpRequestsTotal, httpDuration, presentGauge };
