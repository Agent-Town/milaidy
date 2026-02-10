import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  platform: "node",
  fixedExtension: false,
  tsconfig: "./tsconfig.json"
});
