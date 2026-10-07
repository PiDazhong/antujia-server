const fs = require('fs');
const path = require('path');

// 登录密码文件，与 codeTable.json 同目录：[{ password, desc }]
const PASSWORD_FILE = path.join(__dirname, 'password.json');

// 密码只允许数字、字母、下划线
const PASSWORD_PATTERN = /^[A-Za-z0-9_]+$/;

function isValidPassword(password) {
  return typeof password === 'string' && PASSWORD_PATTERN.test(password);
}

function readPasswords() {
  if (!fs.existsSync(PASSWORD_FILE)) {
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf-8'));
    if (!Array.isArray(data)) return [];
    return data.filter((item) => item && isValidPassword(item.password));
  } catch {
    return [];
  }
}

function writePasswords(list) {
  fs.writeFileSync(PASSWORD_FILE, JSON.stringify(list, null, 2));
}

module.exports = { PASSWORD_PATTERN, isValidPassword, readPasswords, writePasswords };
