import { spawn } from 'node:child_process';
const mode = process.argv[2];
if (!['dev', 'start'].includes(mode)) throw new Error('Choose dev or start.');
const env = { ...process.env, NODE_ENV: mode === 'start' ? 'production' : 'development' };
const children = [
  spawn(process.execPath, ['--import', 'tsx', 'scripts/worker.ts'], { stdio: 'inherit', env }),
  spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', mode, '--hostname', '127.0.0.1', ...process.argv.slice(3)],
    { stdio: 'inherit', env },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  const force = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  }, 5000);
  force.unref();
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
