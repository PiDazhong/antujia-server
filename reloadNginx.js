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

// 本地 nginx.conf 文件（与当前脚本同目录）
const localNginxConf = 'nginx.conf';
// 服务器上 nginx.conf 的路径
const remoteNginxConf = '/etc/nginx/nginx.conf';

// 在 SSH 连接上执行单条命令
const execCommand = (conn, command) => {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        return reject(err);
      }
      let stdout = '';
      let stderr = '';
      stream
        .on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`命令 "${command}" 执行失败，退出码: ${code}\n${stderr}`));
          }
        })
        .on('data', (data) => {
          stdout += data.toString();
          console.log('STDOUT:', data.toString());
        })
        .stderr.on('data', (errData) => {
          stderr += errData.toString();
          console.error('STDERR:', errData.toString());
        });
    });
  });
};

// 上传文件 并 执行命令
const uploadAndExecute = async (localPath, remotePath, sshConfig) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', async () => {
        try {
          console.log('连接成功，开始执行流程...');

          // 1. 先备份服务器上的旧配置（在上传之前）
          console.log(`备份服务器上的旧配置到 ${remotePath}.bak ...`);
          await execCommand(conn, `cp ${remotePath} ${remotePath}.bak`);

          // 2. 上传新配置
          console.log('开始上传新配置...');
          await new Promise((sftpResolve, sftpReject) => {
            conn.sftp((err, sftp) => {
              if (err) {
                return sftpReject(err);
              }

              const localFilePath = path.join(__dirname, localPath);
              const fileSize = (fs.statSync(localFilePath).size / 1024).toFixed(1);

              fs.readFile(localFilePath, 'utf8', (readErr, readData) => {
                if (readErr) {
                  return sftpReject(readErr);
                }
                const lines = readData.split(/\r\n|\r|\n/).length;

                sftp.fastPut(localFilePath, remotePath, {}, (err) => {
                  if (err) {
                    return sftpReject(err);
                  }
                  console.log(
                    `文件上传成功: ${localPath.padEnd(30, ' ')}大小: ${fileSize
                      .toString()
                      .padEnd(6, ' ')}KB      行数: ${lines}`
                  );
                  sftpResolve();
                });
              });
            });
          });

          // 3. 校验配置，通过才重启；失败则恢复备份
          try {
            console.log('校验 nginx 配置 (nginx -t) ...');
            await execCommand(conn, 'nginx -t');
          } catch (testError) {
            console.error('配置校验失败，恢复备份的配置...');
            await execCommand(conn, `mv ${remotePath}.bak ${remotePath}`);
            throw testError;
          }

          console.log('配置校验通过，重启 nginx ...');
          await execCommand(conn, 'systemctl restart nginx');

          console.log('查看 nginx 运行状态...');
          await execCommand(conn, 'systemctl status nginx --no-pager');

          console.log('nginx 重启完成，关闭连接...');
          conn.end();
          resolve();
        } catch (error) {
          conn.end();
          reject(error);
        }
      })
      .connect(sshConfig);

    conn.on('error', (err) => {
      console.error('连接错误:', err);
      reject(err);
    });
  });
};

// 执行上传和重启流程
const main = async () => {
  try {
    console.log('开始上传 nginx.conf...');
    // 流程：备份旧配置 -> 上传新配置 -> nginx -t 校验
    //       -> 校验通过则重启；失败自动恢复备份，避免服务挂掉
    await uploadAndExecute(
      localNginxConf,
      remoteNginxConf,
      sshConfig
    );
    console.log('上传 nginx.conf 并重启 nginx 完成\n');
    console.log('全部任务执行完成!!!');
    console.log(
      '--------------------------------------------------------------------------'
    );
  } catch (error) {
    console.error('操作失败:', error.message);
    process.exit(1); // 停止构建过程
  }
};

main();
