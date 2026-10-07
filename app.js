const express = require('express');
const cors = require('cors');
const fileRoute = require('./fileRoute');
const loginRoute = require('./loginRoute');
const verifyRoute = require('./verifyRoute');
const codeTableRoute = require('./codeTableRoute');
const passwordRoute = require('./passwordRoute');
const moduleRoute = require('./moduleRoute');
const sharkRoute = require('./sharkRoute');
const { BASE_DIR } = require('./moduleUtil');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/damonshome-server/files', fileRoute);
app.use('/damonshome-server/login', loginRoute);
app.use('/damonshome-server/verify', verifyRoute);
app.use('/damonshome-server/codeTable', codeTableRoute);
app.use('/damonshome-server/password', passwordRoute);
app.use('/damonshome-server/module', moduleRoute);
app.use('/damonshome-server/module', sharkRoute);

// 静态文件服务：/damonshome/<模块名>/<文件名> 映射到数据目录（本地 ./data，线上 /damonshome）
// 拦截 info.json，避免模块清单被公开访问
app.use('/damonshome', (req, res, next) => {
  if (req.path.endsWith('.json')) {
    return res.status(403).json({ success: false, code: 0, message: 'Forbidden' });
  }
  next();
}, express.static(BASE_DIR));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
