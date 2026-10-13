const { spawn } = require('child_process');
const path = require('path');

const root = __dirname;

function run(name, command, args, cwd, color) {
  const child = spawn(command, args, {
    cwd: path.join(root, cwd),
    shell: true
  });
  const tag = `[${name}] `;
  const pipe = (stream) => {
    stream.on('data', (data) => {
      process.stdout.write(color + tag + '\x1b[0m' + data.toString());
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code) => console.log(`${tag}exited with code ${code}`));
  return child;
}

async function waitForRpc(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 })
      });
      if (res.ok) return true;
    } catch (e) {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Timed out waiting for the blockchain node at ' + url);
}

async function main() {
  console.log('Starting local blockchain node...');
  run('chain', 'npm', ['run', 'node'], 'blockchain', '\x1b[32m');

  await waitForRpc('http://127.0.0.1:8545');
  console.log('Blockchain is up. Deploying contract...');
  await new Promise((resolve, reject) => {
    const deploy = spawn('npm', ['run', 'deploy'], { cwd: path.join(root, 'blockchain'), shell: true });
    deploy.stdout.on('data', (d) => process.stdout.write('\x1b[32m[deploy] \x1b[0m' + d.toString()));
    deploy.stderr.on('data', (d) => process.stderr.write('\x1b[32m[deploy] \x1b[0m' + d.toString()));
    deploy.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('Deploy failed'))));
  });

  console.log('Starting backend and frontend...');
  run('backend', 'npm', ['start'], 'backend', '\x1b[35m');
  run('frontend', 'npm', ['run', 'dev'], 'frontend', '\x1b[36m');

  console.log('\n========================================');
  console.log('  All services started!');
  console.log('  Frontend: http://localhost:3000');
  console.log('  Backend:  http://localhost:5000');
  console.log('  Chain:    http://127.0.0.1:8545');
  console.log('  Press Ctrl+C to stop everything.');
  console.log('========================================\n');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
