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

// 服务器上需要打包的目录（根目录下的 /damonshome）
const remoteSourceDir = '/damonshome';
// 服务器上打包后临时存放的文件
const remoteTarPath = '/tmp/damonshome.tar.gz';
// 下载到本地的包路径
const localTarPath = path.join(__dirname, 'damonshome.tar.gz');
// 本地解压目标目录（新的 data）
const localDataDir = path.join(__dirname, 'data');

// 在服务器上打包 /damonshome
const packRemoteDir = () => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => {
        console.log('连接成功，开始打包服务器目录...');
        // -C / 打包时去掉开头的 /，解压后直接得到 damonshome 目录
        conn.exec(
          `tar czf ${remoteTarPath} -C / damonshome`,
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
                  console.log('服务器目录打包完成:', remoteTarPath);
                  conn.end();
                  resolve();
                } else {
                  conn.end();
                  reject(new Error(`打包命令退出码: ${code}`));
                }
              })
              .stderr.on('data', (data) => {
                console.error('打包 STDERR:', data.toString());
              });
          }
        );
      })
      .on('error', reject)
      .connect(sshConfig);
  });
};

// 通过 SFTP 下载打包文件到本地
const downloadTar = () => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => {
        console.log('连接成功，开始下载打包文件...');
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          sftp.fastGet(remoteTarPath, localTarPath, {}, (err) => {
            if (err) {
              conn.end();
              return reject(err);
            }
            const fileSize = (fs.statSync(localTarPath).size / 1024).toFixed(
              1
            );
            console.log(
              `下载完成: ${localTarPath}  大小: ${fileSize} KB`
            );
            // 删除服务器上的临时压缩包
            conn.exec(`rm -f ${remoteTarPath}`, (rmErr, stream) => {
              if (rmErr) {
                conn.end();
                return resolve(); // 清理失败不阻塞流程
              }
              stream.on('close', () => {
                conn.end();
                resolve();
              });
              stream.on('data', () => {});
            });
          });
        });
      })
      .on('error', reject)
      .connect(sshConfig);
  });
};

// 删除本地的 data 文件夹（包含其中的内容）
const removeLocalData = () => {
  console.log('删除本地 data 文件夹...');
  fs.rmSync(localDataDir, { recursive: true, force: true });
  console.log('本地 data 文件夹已删除');
};

// 解压下载的包，生成新的 /data
const extractTar = () => {
  console.log('开始解压包生成新的 data...');
  // 先解压到临时目录，再把 damonshome 内容移动为 data
  const tmpDir = path.join(__dirname, '.tmp_extract');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  execSync(`tar xzf "${localTarPath}" -C "${tmpDir}"`);

  const extractedDir = path.join(tmpDir, 'damonshome');
  if (!fs.existsSync(extractedDir)) {
    throw new Error('解压结果中未找到 damonshome 目录');
  }

  fs.renameSync(extractedDir, localDataDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  // 解压完成后删除本地压缩包
  fs.rmSync(localTarPath, { force: true });

  console.log('新的 data 已生成:', localDataDir);
};

// 执行 打包 -> 下载 -> 替换data 流程
const main = async () => {
  try {
    console.log('开始执行 打包下载 damonshome 流程...');
    await packRemoteDir();
    await downloadTar();
    removeLocalData();
    extractTar();
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
