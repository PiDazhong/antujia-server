const path = require('path');

// 模块文本管理文件名（与 info.json 同目录）
const SHARK_FILE = 'shark.json';

// 支持相对路径（如 DAMONSHOME_DIR=./data），统一解析为绝对路径
const BASE_DIR = path.resolve(process.env.DAMONSHOME_DIR || '/damonshome');

function validateModuleName(moduleName) {
  return (
    typeof moduleName === 'string' &&
    moduleName.trim() !== '' &&
    !moduleName.includes('/') &&
    !moduleName.includes('\\') &&
    !moduleName.includes('..')
  );
}

// 解析模块目录，防目录穿越：必须位于 BASE_DIR 内，失败返回 null
function getModuleDir(moduleName) {
  const dir = path.resolve(BASE_DIR, moduleName);
  if (dir !== BASE_DIR && !dir.startsWith(BASE_DIR + path.sep)) {
    return null;
  }
  return dir;
}

// 解析模块目录；失败时向 res 响应 400 并返回 null
function resolveModule(req, res) {
  const { moduleName } = req.body;
  if (!validateModuleName(moduleName)) {
    res.status(400).json({ success: false, code: 0, message: 'moduleName is required and must be a safe directory name' });
    return null;
  }
  const moduleDir = getModuleDir(moduleName);
  if (!moduleDir) {
    res.status(400).json({ success: false, code: 0, message: 'moduleName is invalid' });
    return null;
  }
  return moduleDir;
}

// 按数组顺序重排 sort 为 1..n
function normalizeSort(list) {
  list.forEach((item, index) => {
    item.sort = index + 1;
  });
  return list;
}

// 校验多语言字段：{ zh, en, ar } 对象，各 key 可选但必须是 string
function validateLangMap(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  return ['zh', 'en', 'ar'].every((key) => value[key] === undefined || typeof value[key] === 'string');
}

function invalidLangMap(field) {
  return `${field} must be an object like { zh, en, ar } with string values`;
}

module.exports = {
  BASE_DIR,
  SHARK_FILE,
  validateModuleName,
  getModuleDir,
  resolveModule,
  normalizeSort,
  validateLangMap,
  invalidLangMap
};
