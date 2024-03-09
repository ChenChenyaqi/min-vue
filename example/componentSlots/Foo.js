import { h, renderSlots } from "../../packages/vue/dist/guide-min-vue.esm.js"

export const Foo = {
  setup(props, { emit }) {
    return {}
  },

  render() {
    return h("div", {}, [
      renderSlots(this.$slots, "header", { haha: "haha" }),
      h("p", "foo"),
      renderSlots(this.$slots, "footer"),
    ])
  },
}
