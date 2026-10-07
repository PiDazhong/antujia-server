const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  resolveModule,
  SHARK_FILE,
  normalizeSort,
  validateLangMap,
  invalidLangMap
} = require('./moduleUtil');
const { authMiddleware } = require('./authUtil');

const router = express.Router();

const LANGS = ['zh', 'en', 'ar'];

function getSharkPath(moduleDir) {
  return path.join(moduleDir, SHARK_FILE);
}

// 读取 shark.json；文件不存在（存量模块）时返回 []，写入时自动创建
function readShark(moduleDir) {
  const sharkPath = getSharkPath(moduleDir);
  if (!fs.existsSync(sharkPath)) {
    return [];
  }
  const data = JSON.parse(fs.readFileSync(sharkPath, 'utf-8'));
  return Array.isArray(data) ? data : [];
}

function writeShark(moduleDir, data) {
  fs.writeFileSync(getSharkPath(moduleDir), JSON.stringify(data, null, 2));
}

// 读取模块 shark.json；模块目录不存在时已响应错误，返回 null
function loadShark(moduleDir, res) {
  if (!fs.existsSync(moduleDir) || !fs.statSync(moduleDir).isDirectory()) {
    res.status(404).json({ success: false, code: 0, message: 'module not found' });
    return null;
  }
  try {
    return readShark(moduleDir);
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
    return null;
  }
}

// 查询时兜底：某语言文本缺失或为空串时，返回 `${sharkKey}_${LANG}`
function withFallback(list) {
  return list.map((item) => {
    const text = item.sharkText || {};
    const sharkText = {};
    LANGS.forEach((lang) => {
      const value = text[lang];
      sharkText[lang] = typeof value === 'string' && value.trim() !== ''
        ? value
        : `${item.sharkKey}_${lang.toUpperCase()}`;
    });
    return { ...item, sharkText };
  });
}

// 新增文本条目：sharkKey 同模块内唯一，sort = 当前最大 sort + 1；sharkText 可选（需登录）
router.post('/shark/add', authMiddleware, (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  const { sharkKey, sharkText } = req.body;
  if (typeof sharkKey !== 'string' || sharkKey.trim() === '') {
    return res.status(400).json({ success: false, code: 0, message: 'sharkKey is required and must be a string' });
  }
  if (!validateLangMap(sharkText)) {
    return res.status(400).json({ success: false, code: 0, message: invalidLangMap('sharkText') });
  }

  const list = loadShark(moduleDir, res);
  if (!list) return;

  if (list.some((item) => item.sharkKey === sharkKey)) {
    return res.status(400).json({ success: false, code: 0, message: `sharkKey "${sharkKey}" already exists` });
  }

  try {
    const maxSort = list.reduce((max, item) => (typeof item.sort === 'number' && item.sort > max ? item.sort : max), 0);
    const entry = {
      sort: maxSort + 1,
      sharkKey,
      sharkText: sharkText !== undefined && sharkText !== null
        ? sharkText
        : { zh: '', en: '', ar: '' }
    };
    list.push(entry);
    writeShark(moduleDir, list);
    res.json({ success: true, code: 1, message: 'Added successfully', data: entry });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 删除文本条目：按 sharkKey 移除并重算 sort（需登录）
router.post('/shark/delete', authMiddleware, (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  const { sharkKey } = req.body;
  if (typeof sharkKey !== 'string' || sharkKey.trim() === '') {
    return res.status(400).json({ success: false, code: 0, message: 'sharkKey is required and must be a string' });
  }

  const list = loadShark(moduleDir, res);
  if (!list) return;

  const index = list.findIndex((item) => item.sharkKey === sharkKey);
  if (index === -1) {
    return res.status(404).json({ success: false, code: 0, message: 'sharkKey not found' });
  }

  try {
    list.splice(index, 1);
    normalizeSort(list);
    writeShark(moduleDir, list);
    res.json({ success: true, code: 1, message: 'Deleted successfully', data: list });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 编辑文本条目：只允许修改 sharkText，sharkKey 不可修改（需登录）
router.post('/shark/edit', authMiddleware, (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  const { sharkKey, sharkText } = req.body;
  if (typeof sharkKey !== 'string' || sharkKey.trim() === '') {
    return res.status(400).json({ success: false, code: 0, message: 'sharkKey is required and must be a string' });
  }
  if (sharkText === undefined) {
    return res.status(400).json({ success: false, code: 0, message: 'sharkText is required' });
  }
  if (!validateLangMap(sharkText)) {
    return res.status(400).json({ success: false, code: 0, message: invalidLangMap('sharkText') });
  }

  const list = loadShark(moduleDir, res);
  if (!list) return;

  const entry = list.find((item) => item.sharkKey === sharkKey);
  if (!entry) {
    return res.status(404).json({ success: false, code: 0, message: 'sharkKey not found' });
  }

  try {
    entry.sharkText = sharkText;
    writeShark(moduleDir, list);
    res.json({ success: true, code: 1, message: 'Updated successfully', data: entry });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 条目排序：按 sharkKeys 数组顺序重排，未包含的条目保持相对顺序排在末尾（需登录）
router.post('/shark/sort', authMiddleware, (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  const { sharkKeys } = req.body;
  if (!Array.isArray(sharkKeys)) {
    return res.status(400).json({ success: false, code: 0, message: 'sharkKeys must be an array' });
  }

  const list = loadShark(moduleDir, res);
  if (!list) return;

  try {
    const orderMap = new Map(sharkKeys.map((key, index) => [key, index]));
    const sorted = list.slice().sort((a, b) => {
      const ia = orderMap.has(a.sharkKey) ? orderMap.get(a.sharkKey) : Number.MAX_SAFE_INTEGER;
      const ib = orderMap.has(b.sharkKey) ? orderMap.get(b.sharkKey) : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
    normalizeSort(sorted);
    writeShark(moduleDir, sorted);
    res.json({ success: true, code: 1, message: 'Sorted successfully', data: sorted });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 查询：返回全部文本条目；某语言文本为空时 sharkText 返回 `${sharkKey}_${LANG}` 占位
router.post('/shark/query', (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  const list = loadShark(moduleDir, res);
  if (!list) return;

  res.json({ success: true, code: 1, data: withFallback(list) });
});

module.exports = router;
