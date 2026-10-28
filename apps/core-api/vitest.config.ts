import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: "./",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    passWithNoTests: true,
    setupFiles: ["./test/setup-env.ts"],
    // Every contract file boots the whole AppModule against one database; running them in
    // parallel races on the first-admin seed (unique e-mail) and on shared storage.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
