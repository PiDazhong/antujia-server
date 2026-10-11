const express = require('express');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { readCodeTable } = require('./codeTableRoute');
const { BASE_DIR } = require('./paths');

const router = express.Router();
// 本地：data/analysisPage，生产：/damonshome/analysisPage
const LOG_DIR = path.join(BASE_DIR, 'analysisPage');

function isBlacklisted(req) {
  const clientIp = getClientIp(req);
  const table = readCodeTable();
  const entry = table['black_ips'];
  if (!entry || entry.value === null || entry.value === undefined) {
    return false;
  }
  try {
    const blackList = JSON.parse(entry.value);
    if (Array.isArray(blackList)) {
      return blackList.includes(clientIp);
    }
  } catch {
    // ignore parse error
  }
  return false;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogFileName(dateStr) {
  return path.join(LOG_DIR, `${dateStr}.log`);
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    ''
  );
}

function getDevice(req) {
  return req.headers['user-agent'] || '';
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

function getDatesInRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
  }
  return dates;
}

// 写入日志
router.post('/write', (req, res) => {
  if (isBlacklisted(req)) {
    return res.json({ success: true, code: 1, message: 'in' });
  }

  const { action, name, company, phone, email, message } = req.body;
  if (!action) {
    return res.status(400).json({ success: false, message: 'action is required' });
  }

  const logEntry = {
    action,
    timestamp: formatDate(new Date()),
    device: req.body.device || getDevice(req),
    ip: req.body.ip || getClientIp(req)
  };

  if (action === 'submit') {
    if (name !== undefined) logEntry.name = name;
    if (company !== undefined) logEntry.company = company;
    if (phone !== undefined) logEntry.phone = phone;
    if (email !== undefined) logEntry.email = email;
    if (message !== undefined) logEntry.message = message;
  }

  const line = JSON.stringify(logEntry) + '\n';
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const fileName = getLogFileName(`${y}-${m}-${d}`);

  ensureLogDir();

  fs.appendFile(fileName, line, (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json({ success: true, code: 1, message: 'Logged successfully' });
  });
});

// 查询日志
router.post('/query', async (req, res) => {
  const { startDate, endDate, action } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
  }

  const dates = getDatesInRange(startDate, endDate);
  const results = [];

  for (const dateStr of dates) {
    const fileName = getLogFileName(dateStr);
    if (!fs.existsSync(fileName)) {
      continue;
    }

    const fileStream = fs.createReadStream(fileName);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (action && entry.action !== action) {
          continue;
        }
        results.push(entry);
      } catch {
        // 跳过无法解析的行
      }
    }
  }

  res.json({ success: true, code: 1, count: results.length, data: results });
});

// 删除日志
router.post('/delete', async (req, res) => {
  const { timestamp } = req.body;
  if (!timestamp) {
    return res.status(400).json({ success: false, code: 0, message: 'timestamp is required' });
  }

  const dateStr = timestamp.split(' ')[0];
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ success: false, code: 0, message: 'invalid timestamp format' });
  }

  const fileName = getLogFileName(dateStr);
  if (!fs.existsSync(fileName)) {
    return res.status(404).json({ success: false, code: 0, message: 'log file not found' });
  }

  const fileStream = fs.createReadStream(fileName);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const lines = [];
  let found = false;

  for await (const line of rl) {
    if (!line.trim()) {
      lines.push(line);
      continue;
    }
    try {
      const entry = JSON.parse(line);
      if (entry.timestamp === timestamp) {
        found = true;
        continue;
      }
    } catch {
      // 保留无法解析的行
    }
    lines.push(line);
  }

  if (!found) {
    return res.status(404).json({ success: false, code: 0, message: 'log entry not found' });
  }

  fs.writeFileSync(fileName, lines.map(l => l + '\n').join(''));
  res.json({ success: true, code: 1, message: 'Deleted successfully' });
});

module.exports = router;
module.exports.getClientIp = getClientIp;
