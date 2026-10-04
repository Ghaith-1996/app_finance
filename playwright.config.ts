import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, retries: 0,
  timeout: 60_000, expect: { timeout: 10_000 }, reporter: "line", maxFailures: 1,
  outputDir: "/tmp/pulsefolio-playwright",
  use: {
    baseURL: "http://127.0.0.1:3000", browserName: "chromium",
    trace: "off", screenshot: "off", video: "off", serviceWorkers: "block",
  },
});
