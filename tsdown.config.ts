import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "rpc/index": "src/rpc/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: true,
  target: "es2020", // BigInt support
  platform: "node",
  treeshake: true, // Remove unused code
  // Keep the published file names the package.json exports map points at:
  // CommonJS as .js / .d.ts, ESM as .mjs / .d.mts.
  outExtensions: ({ format }) =>
    format === "cjs" ? { js: ".js", dts: ".d.ts" } : { js: ".mjs", dts: ".d.mts" },
});
