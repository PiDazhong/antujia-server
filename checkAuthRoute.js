const express = require('express');
const { readCodeTable } = require('./codeTableRoute');
const { signToken } = require('./authUtil');
const router = express.Router();

function parseArrayValue(value) {
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(value.replace(/'/g, '"'));
    } catch {
      return null;
    }
  }
}

function getAuthPasswords() {
  const table = readCodeTable();
  const entry = table['auth_password'];
  if (!entry || entry.value === null || entry.value === undefined) {
    return [];
  }
  const passwords = parseArrayValue(entry.value);
  if (Array.isArray(passwords)) {
    return passwords;
  }
  return [];
}

router.post('/', (req, res) => {
  const { password } = req.body;
  const authPasswords = getAuthPasswords();
  if (authPasswords.includes(password)) {
    return res.json({ success: true, code: 1, data: { token: signToken() } });
  }
  res.status(401).json({ success: false, message: 'Invalid password' });
});

module.exports = router;
