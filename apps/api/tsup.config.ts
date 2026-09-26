import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Workspace packages are TypeScript source, so they are bundled in.
  noExternal: [/^@lumen\//],
  external: ["pg", "pg-native"],
});
