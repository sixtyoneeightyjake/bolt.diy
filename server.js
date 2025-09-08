#!/usr/bin/env node

import { createRequestHandler } from '@remix-run/express';
import { installGlobals } from '@remix-run/node';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

installGlobals();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5173;

// Serve static files from the build/client directory
app.use(express.static(join(__dirname, 'build', 'client')));

// Create request handler
const requestHandler = createRequestHandler({
  build: await import('./build/server/index.js'),
});

// Handle all requests with Remix
app.all('*', requestHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
});
