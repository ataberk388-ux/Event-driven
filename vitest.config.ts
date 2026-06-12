import { defineConfig } from "vitest/config";

export default defineConfig({
  // Workspace TS packages use explicit ".js" extensions in relative imports;
  // teach Vite to resolve them to the underlying ".ts" sources.
  resolve: {
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
  test: {
    include: [
      "packages/**/src/**/*.test.ts",
      "services/**/src/**/*.test.ts",
      "apps/**/src/**/*.test.ts",
    ],
    environment: "node",
    passWithNoTests: true,
  },
});
