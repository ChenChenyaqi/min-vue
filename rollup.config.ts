import RollupPluginTypescript from "@rollup/plugin-typescript"
import { RollupOptions } from "rollup"

/** @type {import('rollup'.RollupOptions)} */
export default {
  input: "./src/index.ts",
  output: [
    {
      format: "cjs",
      file: "lib/guide-min-vue.cjs.js",
      sourcemap: "inline",
    },
    {
      format: "es",
      file: "lib/guide-min-vue.esm.js",
      sourcemap: "inline",
    },
  ],
  plugins: [RollupPluginTypescript()],
} as RollupOptions
