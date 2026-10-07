const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { readPasswords } = require('./passwordStore');

// JWT 密钥：线上必须通过环境变量注入，本地开发用兜底默认值
const JWT_SECRET = process.env.JWT_SECRET || 'damonshome-dev-secret-change-me';
const TOKEN_EXPIRES_IN = process.env.TOKEN_EXPIRES_IN || '3d';

if (process.env.ENV === 'prod' && !process.env.JWT_SECRET) {
  console.warn('[auth] WARNING: JWT_SECRET not set, using insecure default secret!');
}

// JWT 里不放明文密码（base64 可解码），只放 SHA-256 哈希
function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function signToken(password) {
  return jwt.sign({ pwd: hashPassword(password) }, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
}

// 校验 Authorization: Bearer <token>
// 1. JWT 签名与过期时间有效
// 2. token 内绑定的密码哈希仍存在于 password.json（密码被删除/替换后立即失效）
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, code: 0, message: 'Unauthorized' });
  }
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, code: 0, message: 'Token invalid or expired' });
  }
  const validHashes = new Set(readPasswords().map((item) => hashPassword(item.password)));
  if (!decoded.pwd || !validHashes.has(decoded.pwd)) {
    return res.status(401).json({ success: false, code: 0, message: '密码已失效，请重新登录' });
  }
  next();
}

module.exports = { signToken, authMiddleware };
