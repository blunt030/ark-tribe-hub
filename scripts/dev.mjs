// Preserve normal backend development. The managed visual preview supplies
// --strictPort and --host; use the isolated fixture there, never a live DB.
import { spawn } from 'node:child_process';
const args = process.argv.slice(2);
const visual = args.includes('--strictPort') && args.includes('--host');
const child = spawn(process.execPath, ['--no-warnings', visual ? 'test/visual-server.mjs' : 'src/server.js', ...args], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
