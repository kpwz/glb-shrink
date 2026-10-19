// 本地一键启动脚本：启动压缩服务，并自动打开浏览器
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3847;

process.env.NODE_ENV = 'production';

console.log('');
console.log('  3D 模型压缩工具正在启动...');
console.log(`  服务地址: http://localhost:${PORT}`);
console.log('  浏览器将自动打开，关闭此窗口即可停止服务');
console.log('');

const child = spawn(process.execPath, [path.join(__dirname, 'server', 'index.mjs')], {
  stdio: 'inherit',
  cwd: __dirname,
});

// 等服务启动后自动打开浏览器（Windows）
setTimeout(() => {
  exec(`start "" "http://localhost:${PORT}"`);
}, 2000);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
