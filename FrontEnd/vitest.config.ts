import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/tests/**", "src/test/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "html", "json", "json-summary", "lcov"],
      reportsDirectory: "../test-reports/frontend",
      reportOnFailure: true,
      // Minimum agreed for the frontend. All application TS/TSX remains in scope.
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
