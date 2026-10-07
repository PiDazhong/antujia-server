const express = require('express');
const { signToken } = require('./authUtil');
const { readPasswords } = require('./passwordStore');
const router = express.Router();

// 登录：校验密码是否在 password.json 中，通过后下发 3d 有效的 JWT
router.post('/', (req, res) => {
  const { password } = req.body;
  const matched = readPasswords().some((item) => item.password === password);
  if (matched) {
    return res.json({ success: true, code: 1, data: { token: signToken(password) } });
  }
  res.status(401).json({ success: false, message: 'Invalid password' });
});

module.exports = router;
