const RollupPluginTypescript = require("@rollup/plugin-typescript")

/** @type {import('rollup'.RollupOptions)} */
module.exports = {
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
