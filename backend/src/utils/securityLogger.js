const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const securityLog = (event, details) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    details,
    ip: details.ip || 'unknown',
  };
  
  console.warn(`[SECURITY] ${event}`, details);
  fs.appendFileSync(
    path.join(logDir, 'security.log'),
    JSON.stringify(logEntry) + '\n'
  );
};

module.exports = { securityLog };