#!/usr/bin/env node

// Production launcher: runs Wrangler Pages dev against the built client
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const PORT = process.env.PORT || 5173;

console.log(`🚀 Starting Bolt.diy production server on port ${PORT}...`);

// Resolve local wrangler binary for systemd/non-interactive environments
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localWrangler = path.resolve(__dirname, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
const wranglerCmd = existsSync(localWrangler) ? localWrangler : 'wrangler';

// Get bindings and start wrangler in production mode
const bindings = process.env.BINDINGS || '';
const cmd = `${JSON.stringify(wranglerCmd)} pages dev ./build/client ${bindings} --ip 0.0.0.0 --port ${PORT} --no-show-interactive-dev-session --compatibility-date=2024-01-01`;

const child = spawn(cmd, {
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
});

child.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code ?? 0);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  child.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  child.kill('SIGINT');
});
