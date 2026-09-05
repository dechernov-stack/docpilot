import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const apiPort = 8011;
const uiPort = 5174;
const runDir = path.join(os.tmpdir(), `docpilot-e2e-${process.pid}`);

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: `http://127.0.0.1:${uiPort}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: '..',
      env: {
        DOCPILOT_DB: path.join(runDir, 'docpilot.db'),
        DOCPILOT_DOCS_ROOT: path.join(runDir, 'repos'),
      },
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${uiPort}`,
      cwd: '../frontend',
      env: { VITE_API_TARGET: `http://127.0.0.1:${apiPort}` },
      url: `http://127.0.0.1:${uiPort}`,
      reuseExistingServer: false,
    },
  ],
});
