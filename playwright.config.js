import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chromium',
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] },
  },
  webServer: { command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 30000 },
});
