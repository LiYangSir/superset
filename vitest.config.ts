import { defineConfig } from "vitest/config";
import tsconfigPathsPlugin from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPathsPlugin()],
  test: {
    setupFiles: ["./test-setup.ts"],
    environment: "node",
  },
});
