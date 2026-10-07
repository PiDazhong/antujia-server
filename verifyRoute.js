const express = require('express');
const { authMiddleware } = require('./authUtil');

const router = express.Router();

// 单纯的 token 鉴权：校验 Authorization: Bearer <token> 是否有效
// 前端进入页面时调用，用于判断登录态；无效时由 authMiddleware 返回 401
router.post('/', authMiddleware, (req, res) => {
  res.json({ success: true, code: 1, message: 'ok' });
});

module.exports = router;
