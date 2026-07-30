import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "unit",
      include: ["{packages,apps}/**/*.test.ts"],
      exclude: ["**/*.int.test.ts", "**/node_modules/**", "**/dist/**"],
    },
  },
  {
    test: {
      name: "integration",
      include: ["{packages,apps}/**/*.int.test.ts"],
      exclude: ["**/node_modules/**"],
      testTimeout: 120_000,
      hookTimeout: 120_000,
    },
  },
]);
