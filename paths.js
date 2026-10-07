const path = require('path');

// ===== 环境 =====
// 线上启动脚本注入 ENV=prod
const IS_PROD = process.env.ENV === 'prod';

// ===== 数据根目录 =====
// 支持相对路径（如 DAMONSHOME_DIR=./data），统一解析为绝对路径
const BASE_DIR = path.resolve(process.env.DAMONSHOME_DIR || '/damonshome');

// ===== 服务目录下的数据文件（统一放在 BASE_DIR 下） =====
// 登录密码文件：[{ password, desc }]
const PASSWORD_FILE = path.join(BASE_DIR, 'password.json');
// 码表文件
const CODE_TABLE_FILE = path.join(BASE_DIR, 'codeTable.json');

// ===== 模块目录内的固定文件名 =====
const INFO_FILE = 'info.json';
const SHARK_FILE = 'shark.json';

module.exports = {
  IS_PROD,
  BASE_DIR,
  PASSWORD_FILE,
  CODE_TABLE_FILE,
  INFO_FILE,
  SHARK_FILE
};
