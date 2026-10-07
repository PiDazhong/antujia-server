const express = require('express');
const { authMiddleware } = require('./authUtil');
const { isValidPassword, readPasswords, writePasswords } = require('./passwordStore');

const router = express.Router();

// 查询密码列表（需登录：返回明文密码，不能公开）
router.post('/query', authMiddleware, (req, res) => {
  try {
    res.json({ success: true, code: 1, data: readPasswords() });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 批量保存：整表替换（items 为全部行，需登录）
// 校验：密码格式（数字/字母/下划线）、不允许重复、至少保留一条（防止全删后所有人无法登录）
router.post('/save', authMiddleware, (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, code: 0, message: 'items must be an array' });
  }
  if (items.length === 0) {
    return res.status(400).json({ success: false, code: 0, message: '至少保留一条登录密码' });
  }

  const list = [];
  const seen = new Set();
  for (const item of items) {
    const password = typeof item?.password === 'string' ? item.password.trim() : '';
    if (!isValidPassword(password)) {
      return res.status(400).json({ success: false, code: 0, message: `密码 "${password}" 不合法，仅限数字、字母、下划线` });
    }
    if (seen.has(password)) {
      return res.status(400).json({ success: false, code: 0, message: `密码 "${password}" 重复` });
    }
    seen.add(password);
    list.push({ password, desc: typeof item?.desc === 'string' ? item.desc.trim() : '' });
  }

  try {
    writePasswords(list);
    res.json({ success: true, code: 1, message: 'Saved successfully', data: list });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 删除单条密码（需登录）；最后一条不允许删除
router.post('/delete', authMiddleware, (req, res) => {
  const { password } = req.body;
  if (!isValidPassword(password)) {
    return res.status(400).json({ success: false, code: 0, message: 'password is required' });
  }

  const list = readPasswords();
  if (!list.some((item) => item.password === password)) {
    return res.status(404).json({ success: false, code: 0, message: 'password not found' });
  }
  if (list.length <= 1) {
    return res.status(400).json({ success: false, code: 0, message: '至少保留一条登录密码' });
  }

  try {
    writePasswords(list.filter((item) => item.password !== password));
    res.json({ success: true, code: 1, message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

module.exports = router;
