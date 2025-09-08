#!/usr/bin/env node

// Simple production server that uses wrangler but on the correct port
import { spawn } from 'child_process';

const PORT = process.env.PORT || 5173;

console.log(`🚀 Starting Bolt.diy production server on port ${PORT}...`);

// Get bindings and start wrangler in production mode
const bindings = process.env.BINDINGS || '';
const cmd = `wrangler pages dev ./build/client ${bindings} --ip 0.0.0.0 --port ${PORT} --no-show-interactive-dev-session --compatibility-date=2024-01-01`;

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
  process.exit(code);
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
