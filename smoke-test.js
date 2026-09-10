const { spawn } = require('child_process');
const electronBinary = require('electron');

const child = spawn(electronBinary, ['.', '--smoke-test', '--no-sandbox', '--disable-gpu'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: '1'
  }
});

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
  process.exit(1);
}, 15000);

child.on('close', (code, signal) => {
  clearTimeout(timeout);
  process.exit(signal ? 1 : code ?? 1);
});

child.on('error', () => {
  clearTimeout(timeout);
  process.exit(1);
});
