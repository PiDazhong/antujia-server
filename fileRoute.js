const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { resolveModule, validateModuleName, getModuleDir, INFO_FILE } = require('./moduleUtil');
const { authMiddleware } = require('./authUtil');

const router = express.Router();

// INFO_FILE（模块清单文件）不属于模块内容文件，查询时排除

function validateFilename(filename) {
  return (
    typeof filename === 'string' &&
    filename.trim() !== '' &&
    !filename.includes('/') &&
    !filename.includes('\\') &&
    !filename.includes('..')
  );
}

// 解析模块内文件/目录的绝对路径；失败返回 null
function resolveTarget(moduleDir, name) {
  const target = path.resolve(moduleDir, name);
  if (target !== moduleDir && !target.startsWith(moduleDir + path.sep)) {
    return null;
  }
  return target;
}

// multipart 字段默认按 latin1 解码，中文文件名会乱码，这里转回 utf8
function fixEncoding(name) {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { moduleName } = req.body;
    if (!validateModuleName(moduleName)) {
      return cb(new Error('INVALID_MODULE'));
    }
    const moduleDir = getModuleDir(moduleName);
    if (!moduleDir) {
      return cb(new Error('INVALID_MODULE'));
    }
    try {
      // 模块必须先通过 /module/create 创建，避免产生无 info.json 的孤儿目录
      if (!fs.existsSync(path.join(moduleDir, INFO_FILE))) {
        return cb(new Error('MODULE_NOT_FOUND'));
      }
      cb(null, moduleDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    // 磁盘上以 uuid 命名（避免乱码和重名冲突），原始文件名由 fileName 字段保存
    const original = fixEncoding(path.basename(file.originalname));
    const ext = path.extname(original);
    cb(null, randomUUID() + ext);
  }
});

const upload = multer({ storage });

// 获取模块目录下的所有文件名称（排除 info.json）
router.post('/list', (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  try {
    if (!fs.existsSync(moduleDir) || !fs.statSync(moduleDir).isDirectory()) {
      return res.status(404).json({ success: false, code: 0, message: 'module not found' });
    }
    const files = fs.readdirSync(moduleDir).filter((name) => name !== INFO_FILE);
    res.json({ success: true, code: 1, data: files });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 删除模块目录下的文件或目录（需登录）
router.post('/delete', authMiddleware, (req, res) => {
  const moduleDir = resolveModule(req, res);
  if (!moduleDir) return;

  const { filename } = req.body;
  if (!validateFilename(filename)) {
    return res.status(400).json({ success: false, code: 0, message: 'filename is required and must be a safe file name' });
  }
  if (filename === INFO_FILE) {
    return res.status(400).json({ success: false, code: 0, message: 'info.json cannot be deleted here' });
  }

  try {
    const target = resolveTarget(moduleDir, filename);
    if (!target) {
      return res.status(400).json({ success: false, code: 0, message: 'filename is invalid' });
    }
    if (!fs.existsSync(target)) {
      return res.status(404).json({ success: false, code: 0, message: 'File not found' });
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true });
    } else {
      fs.unlinkSync(target);
    }
    res.json({ success: true, code: 1, message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, code: 0, message: err.message });
  }
});

// 文件上传到模块目录（multipart: moduleName 字段 + file 文件）（需登录）
router.post('/upload', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.message === 'INVALID_MODULE') {
        return res.status(400).json({ success: false, code: 0, message: 'moduleName is required and must be a safe directory name' });
      }
      if (err.message === 'MODULE_NOT_FOUND') {
        return res.status(404).json({ success: false, code: 0, message: 'module not found, please create it first' });
      }
      return res.status(400).json({ success: false, code: 0, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, code: 0, message: 'No file uploaded' });
    }
    // filename 为磁盘上的 uuid 文件名（即 fileUrl 的path部分），originalname 为原始显示名（存入 fileName 字段）
    res.json({
      success: true,
      code: 1,
      message: 'Uploaded successfully',
      data: {
        filename: req.file.filename,
        originalname: fixEncoding(path.basename(req.file.originalname))
      }
    });
  });
});

module.exports = router;
