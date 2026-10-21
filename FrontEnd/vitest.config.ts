import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/tests/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "html", "json", "json-summary", "lcov"],
      reportsDirectory: "../test-reports/frontend",
      reportOnFailure: true,
      // Baseline guard, not the rubric score. All application TS/TSX remains in scope.
      thresholds: { statements: 50, branches: 47, functions: 40, lines: 51 },
    },
  },
});
