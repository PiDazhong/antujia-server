const path = require('path');

// 支持相对路径（如 ANTUJIA_DIR=./data），统一解析为绝对路径
const BASE_DIR = path.resolve(process.env.ANTUJIA_DIR || '/antujia');

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

module.exports = { BASE_DIR, validateModuleName, getModuleDir, resolveModule };
