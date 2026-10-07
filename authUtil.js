const jwt = require('jsonwebtoken');

// JWT 密钥：线上必须通过环境变量注入，本地开发用兜底默认值
const JWT_SECRET = process.env.JWT_SECRET || 'damonshome-dev-secret-change-me';
const TOKEN_EXPIRES_IN = process.env.TOKEN_EXPIRES_IN || '12h';

if (process.env.ENV === 'prod' && !process.env.JWT_SECRET) {
  console.warn('[auth] WARNING: JWT_SECRET not set, using insecure default secret!');
}

function signToken() {
  return jwt.sign({ sub: 'admin' }, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
}

// 校验 Authorization: Bearer <token>，失败统一返回 401
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, code: 0, message: 'Unauthorized' });
  }
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, code: 0, message: 'Token invalid or expired' });
  }
}

module.exports = { signToken, authMiddleware };
