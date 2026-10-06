const express = require('express');
const cors = require('cors');
const fileRoute = require('./fileRoute');
const checkAuthRoute = require('./checkAuthRoute');
const codeTableRoute = require('./codeTableRoute');
const moduleRoute = require('./moduleRoute');
const { BASE_DIR } = require('./moduleUtil');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/antujia-server/files', fileRoute);
app.use('/antujia-server/checkAuth', checkAuthRoute);
app.use('/antujia-server/codeTable', codeTableRoute);
app.use('/antujia-server/module', moduleRoute);

// 静态文件服务：/icons/<模块名>/<文件名> 映射到数据目录（本地 ./data，线上 /antujia）
// 拦截 info.json，避免模块清单被公开访问
app.use('/icons', (req, res, next) => {
  if (req.path.endsWith('.json')) {
    return res.status(403).json({ success: false, code: 0, message: 'Forbidden' });
  }
  next();
}, express.static(BASE_DIR));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
