import RollupPluginTypescript from "@rollup/plugin-typescript"

/** @type {import('rollup'.RollupOptions)} */
export default {
  input: "./packages/vue/src/index.ts",
  output: [
    {
      format: "cjs",
      file: "packages/vue/dist/guide-min-vue.cjs.js",
      sourcemap: "inline",
    },
    {
      format: "es",
      file: "packages/vue/dist/guide-min-vue.esm.js",
      sourcemap: "inline",
    },
  ],
  plugins: [RollupPluginTypescript()],
}
