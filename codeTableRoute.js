const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
// 线上启动脚本注入 ENV=prod，走 /damonshome/codeTable.json；本地开发用服务目录下的 codeTable.json
const CODE_TABLE_FILE =
  process.env.ENV === 'prod' ? '/damonshome/codeTable.json' : path.join(__dirname, 'codeTable.json');

function normalizeEntry(entry) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return {
      value: entry.value !== undefined ? entry.value : null,
      desc: entry.desc !== undefined ? entry.desc : '',
      sort: typeof entry.sort === 'number' ? entry.sort : 0
    };
  }
  return { value: entry !== undefined ? entry : null, desc: '', sort: 0 };
}

function readCodeTable() {
  if (!fs.existsSync(CODE_TABLE_FILE)) {
    return {};
  }
  try {
    const content = fs.readFileSync(CODE_TABLE_FILE, 'utf-8');
    const raw = JSON.parse(content);
    const normalized = {};
    for (const [code, val] of Object.entries(raw)) {
      normalized[code] = normalizeEntry(val);
    }
    return normalized;
  } catch {
    return {};
  }
}

function writeCodeTable(data) {
  fs.writeFileSync(CODE_TABLE_FILE, JSON.stringify(data, null, 2));
}

function entryToResponse(code, entry) {
  return { code, value: entry.value, desc: entry.desc, sort: entry.sort };
}

// 查询码表
router.post('/query', (req, res) => {
  const { codes } = req.body;
  if (!Array.isArray(codes)) {
    return res.status(400).json({ success: false, code: 0, message: 'codes must be an array' });
  }

  const table = readCodeTable();
  let result;
  if (codes.length === 0) {
    result = Object.entries(table).map(([code, entry]) => entryToResponse(code, entry));
  } else {
    result = codes.map((code) => {
      const entry = table[code];
      if (entry) {
        return entryToResponse(code, entry);
      }
      return { code, value: null, desc: '', sort: 0 };
    });
  }

  res.json({ success: true, code: 1, data: result });
});

// 新增或修改码表（支持单条和批量）
router.post('/save', (req, res) => {
  let items = req.body.items;
  if (!items) {
    const { code, value, desc, sort } = req.body;
    if (code === undefined || code === null || code === '') {
      return res.status(400).json({ success: false, code: 0, message: 'code is required' });
    }
    if (value === undefined) {
      return res.status(400).json({ success: false, code: 0, message: 'value is required' });
    }
    items = [{ code, value, desc, sort }];
  }

  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, code: 0, message: 'items must be an array' });
  }
  if (items.length === 0) {
    return res.status(400).json({ success: false, code: 0, message: 'items is empty' });
  }

  const table = readCodeTable();
  for (const item of items) {
    if (item.code === undefined || item.code === null || item.code === '') {
      return res.status(400).json({ success: false, code: 0, message: 'code is required for all items' });
    }
    if (item.value === undefined) {
      return res.status(400).json({ success: false, code: 0, message: 'value is required for all items' });
    }
    const existing = table[item.code];
    let sort;
    if (typeof item.sort === 'number') {
      sort = item.sort;
    } else if (existing) {
      // 更新已有条目且未传 sort，保留原值
      sort = existing.sort;
    } else {
      // 新建条目且未传 sort，排到末尾
      sort = Object.values(table).reduce((max, e) => (e.sort > max ? e.sort : max), 0) + 1;
    }
    table[item.code] = {
      value: item.value,
      desc: item.desc !== undefined ? item.desc : '',
      sort
    };
  }
  writeCodeTable(table);

  res.json({ success: true, code: 1, message: 'Saved successfully' });
});

// 排序：按 codes 数组顺序重排码表，并重算 sort 为 1..n
router.post('/sort', (req, res) => {
  const { codes } = req.body;
  if (!Array.isArray(codes)) {
    return res.status(400).json({ success: false, code: 0, message: 'codes must be an array' });
  }

  const table = readCodeTable();
  const orderMap = new Map(codes.map((code, index) => [code, index]));
  const sorted = Object.entries(table).sort(([a], [b]) => {
    const ia = orderMap.has(a) ? orderMap.get(a) : Number.MAX_SAFE_INTEGER;
    const ib = orderMap.has(b) ? orderMap.get(b) : Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });

  sorted.forEach(([code, entry], index) => {
    table[code] = { value: entry.value, desc: entry.desc, sort: index + 1 };
  });
  writeCodeTable(table);

  const data = sorted.map(([code]) => entryToResponse(code, table[code]));
  res.json({ success: true, code: 1, message: 'Sorted successfully', data });
});

// 删除码表
router.post('/delete', (req, res) => {
  const { code } = req.body;
  if (code === undefined || code === null || code === '') {
    return res.status(400).json({ success: false, code: 0, message: 'code is required' });
  }

  const table = readCodeTable();
  if (!(code in table)) {
    return res.status(404).json({ success: false, code: 0, message: 'code not found' });
  }

  delete table[code];
  // 剩余条目按现有 sort 顺序重算为 1..n
  const remaining = Object.values(table).sort((a, b) => a.sort - b.sort);
  remaining.forEach((entry, index) => {
    entry.sort = index + 1;
  });
  writeCodeTable(table);

  res.json({ success: true, code: 1, message: 'Deleted successfully' });
})

module.exports = router;
module.exports.readCodeTable = readCodeTable;
module.exports.writeCodeTable = writeCodeTable;
