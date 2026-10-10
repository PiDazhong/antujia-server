import { execSync } from 'child_process';
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const sshConfig = {
  host: '47.237.213.46',
  port: '22',
  username: 'root',
  password: 'Lmz123456@',
};

// 获取当前模块的文件路径
const __filename = fileURLToPath(import.meta.url);

// 获取当前模块的目录路径
const __dirname = path.dirname(__filename);

// 本地需要打包上传的目录（data）
const localDataDir = path.join(__dirname, 'data');
// 本地打包后的 zip 文件
const localZipPath = path.join(__dirname, 'damonshome.zip');
// 服务器上临时存放的 zip 文件
const remoteZipPath = '/tmp/damonshome.zip';
// 服务器上的目标目录（根目录下的 /damonshome）
const remoteTargetDir = '/damonshome';

// 在本地打包 data 目录为 damonshome.zip
const compressLocalData = () => {
  console.log('开始打包本地 data 目录...');
  if (!fs.existsSync(localDataDir)) {
    throw new Error(`本地目录不存在: ${localDataDir}`);
  }
  fs.rmSync(localZipPath, { force: true });
  // 在 data 目录内打包所有内容，zip 解压后即为 data 的内容（配合 unzip -d 直接解压到目标目录）
  execSync(`cd "${localDataDir}" && zip -rX "${localZipPath}" . -x "*.DS_Store"`);
  const fileSize = (fs.statSync(localZipPath).size / 1024).toFixed(1);
  console.log(`本地打包完成: ${localZipPath}  大小: ${fileSize} KB`);
};

// 通过 SFTP 上传 zip 文件到服务器
const uploadZip = () => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => {
        console.log('连接成功，开始上传压缩包...');
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          sftp.fastPut(localZipPath, remoteZipPath, {}, (err) => {
            if (err) {
              conn.end();
              return reject(err);
            }
            const fileSize = (fs.statSync(localZipPath).size / 1024).toFixed(
              1
            );
            console.log(`上传完成: ${remoteZipPath}  大小: ${fileSize} KB`);
            conn.end();
            resolve();
          });
        });
      })
      .on('error', reject)
      .connect(sshConfig);
  });
};

// 在服务器上删除旧的 /damonshome 并解压新的 zip
const replaceRemoteDir = () => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => {
        console.log('连接成功，开始替换服务器目录...');
        conn.exec(
          `rm -rf ${remoteTargetDir} && mkdir -p ${remoteTargetDir} && unzip -o ${remoteZipPath} -d ${remoteTargetDir} && rm -f ${remoteZipPath}`,
          (err, stream) => {
            if (err) {
              conn.end();
              return reject(err);
            }
            stream
              // 必须消费 stdout，否则命令会卡住不触发 close 事件
              .on('data', () => {})
              .on('close', (code) => {
                if (code === 0) {
                  console.log('服务器目录替换完成:', remoteTargetDir);
                  conn.end();
                  resolve();
                } else {
                  conn.end();
                  reject(new Error(`替换命令退出码: ${code}`));
                }
              })
              .stderr.on('data', (data) => {
                console.error('替换 STDERR:', data.toString());
              });
          }
        );
      })
      .on('error', reject)
      .connect(sshConfig);
  });
};

// 删除本地的临时压缩包
const removeLocalZip = () => {
  console.log('删除本地压缩包...');
  fs.rmSync(localZipPath, { force: true });
  console.log('本地压缩包已删除');
};

// 执行 打包 -> 上传 -> 替换服务器目录 -> 清理 流程
const main = async () => {
  try {
    console.log('开始执行 打包上传 damonshome 流程...');
    compressLocalData();
    await uploadZip();
    await replaceRemoteDir();
    removeLocalZip();
    console.log('全部任务执行完成!!!');
    console.log(
      '--------------------------------------------------------------------------'
    );
  } catch (error) {
    console.error('操作失败:', error);
    process.exit(1);
  }
};

main();
