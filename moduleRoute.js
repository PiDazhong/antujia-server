const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { resolveModule, BASE_DIR, SHARK_FILE, normalizeSort, validateLangMap, invalidLangMap } = require('./moduleUtil');
const { readCodeTable, writeCodeTable } = require('./codeTableRoute');

const router = express.Router();

// 码表中存储模块列表的 key；value 为 JSON 字符串数组，如 '["header", "其他"]'
const MODULE_CODE_KEY = 'moudle';

function readModuleList() {
  const table = readCodeTable();
  const entry = table[MODULE_CODE_KEY];
  if (!entry || entry.value === null || entry.value === undefined) {
    return [];
  }
  if (Array.isArray(entry.value)) {
    return entry.value;
  }
  try {
    const parsed = JSON.parse(entry.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeModuleList(list) {
  const table = readCodeTable();
  const prev = table[MODULE_CODE_KEY];
  table[MODULE_CODE_KEY] = {
    value: JSON.stringify(list),
    desc: prev ? prev.desc : '',
    sort: prev && typeof prev.sort === 'number' ? prev.sort : 0
  };
  writeCodeTable(table);
}

function getInfoPath(moduleDir) {
  return path.join(moduleDir, 'info.json');
}

function readInfo(moduleDir) {
  const infoPath = getInfoPath(moduleDir);
  if (!fs.existsSync(infoPath)) {
    return null;
  }
  const content = fs.readFileSync(infoPath, 'utf-8');
  const data = JSON.parse(content);
  return Array.isArray(data) ? data : [];
}

function writeInfo(moduleDir, data) {
  fs.writeFileSync(getInfoPath(moduleDir), JSON.stringify(data, null, 2));
}

// 解析 fileUrl 为磁盘绝对路径：
// 1) 绝对路径且在 BASE_DIR 内，直接使用
// 2) 否则视为相对 BASE_DIR 的路径（如 '/header/x.png' 或 'header/x.png'）
// 3) 都不满足返回 null（不允许删 BASE_DIR 外的文件）
function resolveFileUrl(fileUrl) {
  let p = path.resolve(fileUrl);
  if (p === BASE_DIR || p.startsWith(BASE_DIR + path.sep)) {
    return p;
  }
  const rel = fileUrl.startsWith('/') ? fileUrl : '/' + fileUrl;
  p = path.resolve(BASE_DIR, '.' + rel);
  if (p === BASE_DIR || p.startsWith(BASE_DIR + path.sep)) {
    return p;
  }
  return null;
}

// 读取模块 info.json，失败时已响应错误，返回 null
function loadInfo(moduleDir, res) {
  if (!fs.existsSync(moduleDir) || !fs.statSync(moduleDir).isDirectory()) {
    res.status(404).json({ success: false, code: 0, message: 'module not found' });
    return null;
  }
  try {
    const info = readInfo(moduleDir);
    if (info === null) {
      res.status(404).json({ success: false, code: 0, message: 'info.json not found' });
      return null;
    }
    return info;
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
    return null;
  }
}

// 创建模块：新建模块目录及 info.json（内容为 []），并登记到码表 moudle 中
router.post('/create', (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;
  const { moduleName } = req.body;

  try {
    fs.mkdirSync(moduleDir, { recursive: true });
    const infoPath = getInfoPath(moduleDir);
    if (!fs.existsSync(infoPath)) {
      fs.writeFileSync(infoPath, '[]');
    }
    // 同时创建 shark.json 供文本管理使用
    const sharkPath = path.join(moduleDir, SHARK_FILE);
    if (!fs.existsSync(sharkPath)) {
      fs.writeFileSync(sharkPath, '[]');
    }
    const modules = readModuleList();
    if (!modules.includes(moduleName)) {
      modules.push(moduleName);
      writeModuleList(modules);
    }
    res.json({ success: true, code: 1, message: 'Module created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 删除模块：删除模块目录（含全部内容），并从码表 moudle 中移除该模块名
router.post('/deleteModule', (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  try {
    if (fs.existsSync(moduleDir)) {
      fs.rmSync(moduleDir, { recursive: true, force: true });
    }
    const modules = readModuleList().filter((name) => name !== req.body.moduleName);
    writeModuleList(modules);
    res.json({ success: true, code: 1, message: 'Module deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 查询模块列表：返回码表 moudle 的 value 解析后的数组
router.post('/queryModuleList', (req, res) => {
  try {
    res.json({ success: true, code: 1, data: readModuleList() });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 排序：按 moduleNames 数组顺序重排码表 moudle，未包含的模块保持相对顺序排在末尾
router.post('/sort', (req, res) => {
  const { moduleNames } = req.body;
  if (!Array.isArray(moduleNames)) {
    return res.status(400).json({ success: false, code: 0, message: 'moduleNames must be an array' });
  }

  try {
    const modules = readModuleList();
    const orderMap = new Map(moduleNames.map((name, index) => [name, index]));
    const sorted = modules.slice().sort((a, b) => {
      const ia = orderMap.has(a) ? orderMap.get(a) : Number.MAX_SAFE_INTEGER;
      const ib = orderMap.has(b) ? orderMap.get(b) : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
    writeModuleList(sorted);
    res.json({ success: true, code: 1, message: 'Sorted successfully', data: sorted });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 新增条目：sort = 当前最大 sort + 1，fileId 全局唯一
router.post('/add', (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  const { fileUrl, fileName, fileDesc, fileSubDesc } = req.body;
  if (typeof fileUrl !== 'string' || fileUrl.trim() === '') {
    return res.status(400).json({ success: false, code: 0, message: 'fileUrl is required and must be a string' });
  }
  if (typeof fileName !== 'string' || fileName.trim() === '') {
    return res.status(400).json({ success: false, code: 0, message: 'fileName is required and must be a string' });
  }
  // fileDesc / fileSubDesc 为多语言对象 { zh, en, ar }；fileDesc 必填，fileSubDesc 可选
  if (fileDesc === undefined || fileDesc === null) {
    return res.status(400).json({ success: false, code: 0, message: 'fileDesc is required' });
  }
  if (!validateLangMap(fileDesc, 'fileDesc')) {
    return res.status(400).json({ success: false, code: 0, message: invalidLangMap('fileDesc') });
  }
  if (!validateLangMap(fileSubDesc, 'fileSubDesc')) {
    return res.status(400).json({ success: false, code: 0, message: invalidLangMap('fileSubDesc') });
  }

  const info = loadInfo(moduleDir, res);
  if (!info) return;

  try {
    const maxSort = info.reduce((max, item) => (typeof item.sort === 'number' && item.sort > max ? item.sort : max), 0);
    const entry = {
      sort: maxSort + 1,
      fileId: randomUUID(),
      fileUrl,
      fileName,
      fileDesc,
      fileSubDesc: fileSubDesc !== undefined ? fileSubDesc : { zh: '', en: '', ar: '' }
    };
    info.push(entry);
    writeInfo(moduleDir, info);
    res.json({ success: true, code: 1, message: 'Added successfully', data: entry });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 条目排序：按 fileIds 数组顺序重排 info.json，并重算 sort
// 注意：/sort 已被模块列表排序占用，此处用 /sortItems 避免路由冲突
router.post('/sortItems', (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  const { fileIds } = req.body;
  if (!Array.isArray(fileIds)) {
    return res.status(400).json({ success: false, code: 0, message: 'fileIds must be an array' });
  }

  const info = loadInfo(moduleDir, res);
  if (!info) return;

  try {
    const orderMap = new Map(fileIds.map((id, index) => [id, index]));
    const sorted = info.slice().sort((a, b) => {
      const ia = orderMap.has(a.fileId) ? orderMap.get(a.fileId) : Number.MAX_SAFE_INTEGER;
      const ib = orderMap.has(b.fileId) ? orderMap.get(b.fileId) : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
    normalizeSort(sorted);
    writeInfo(moduleDir, sorted);
    res.json({ success: true, code: 1, message: 'Sorted successfully', data: sorted });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 删除：移除对应对象、删除 fileUrl 磁盘文件、重算 sort
router.post('/delete', (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  const { fileId } = req.body;
  if (fileId === undefined || fileId === null || fileId === '') {
    return res.status(400).json({ success: false, code: 0, message: 'fileId is required' });
  }

  const info = loadInfo(moduleDir, res);
  if (!info) return;

  const index = info.findIndex((item) => item.fileId === fileId);
  if (index === -1) {
    return res.status(404).json({ success: false, code: 0, message: 'fileId not found' });
  }

  try {
    const [removed] = info.splice(index, 1);

    // 删除 fileUrl 对应的磁盘文件（仅限 BASE_DIR 内）
    if (removed.fileUrl) {
      const filePath = resolveFileUrl(removed.fileUrl);
      if (filePath && fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
    }

    normalizeSort(info);
    writeInfo(moduleDir, info);
    res.json({ success: true, code: 1, message: 'Deleted successfully', data: info });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 编辑：更新 fileDesc / fileSubDesc
router.post('/edit', (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  const { fileId, fileDesc, fileSubDesc } = req.body;
  if (fileId === undefined || fileId === null || fileId === '') {
    return res.status(400).json({ success: false, code: 0, message: 'fileId is required' });
  }
  if (fileDesc === undefined && fileSubDesc === undefined) {
    return res.status(400).json({ success: false, code: 0, message: 'fileDesc or fileSubDesc is required' });
  }
  if (!validateLangMap(fileDesc, 'fileDesc')) {
    return res.status(400).json({ success: false, code: 0, message: invalidLangMap('fileDesc') });
  }
  if (!validateLangMap(fileSubDesc, 'fileSubDesc')) {
    return res.status(400).json({ success: false, code: 0, message: invalidLangMap('fileSubDesc') });
  }

  const info = loadInfo(moduleDir, res);
  if (!info) return;

  const entry = info.find((item) => item.fileId === fileId);
  if (!entry) {
    return res.status(404).json({ success: false, code: 0, message: 'fileId not found' });
  }

  try {
    if (fileDesc !== undefined) entry.fileDesc = fileDesc;
    if (fileSubDesc !== undefined) entry.fileSubDesc = fileSubDesc;
    writeInfo(moduleDir, info);
    res.json({ success: true, code: 1, message: 'Updated successfully', data: entry });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 查询：返回模块 info.json 内容
router.post('/query', (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  const info = loadInfo(moduleDir, res);
  if (!info) return;

  res.json({ success: true, code: 1, data: info });
});

module.exports = router;
