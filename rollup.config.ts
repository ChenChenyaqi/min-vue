import RollupPluginTypescript from "@rollup/plugin-typescript"

/** @type {import('rollup'.RollupOptions)} */
export default {
  input: "./src/index.ts",
  output: [
    {
      format: "cjs",
      file: "lib/guide-min-vue.cjs.js",
    },
    {
      format: "es",
      file: "lib/guide-min-vue.esm.js",
    },
  ],
  plugins: [RollupPluginTypescript()],
}
