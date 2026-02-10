import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "**/node_modules/**"],
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
