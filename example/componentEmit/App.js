import { h } from "../../packages/vue/dist/guide-min-vue.esm.js"
import { Foo } from "./Foo.js"

window.self = null
export const App = {
  render() {
    window.self = this
    return h("div", { id: "root", class: ["red", "hard"] }, [
      "hi, " + this.msg,
      "min-vue",
      h("p", { onClick: () => console.log("click!") }, "我是一个p"),
      h(Foo, {
        count: 1,
        onAdd(a, b) {
          console.log("onAdd: ", a, b)
        },
        onAddFoo(a) {
          console.log("onAddFoo: ", a)
        },
      }),
    ])
  },
  setup() {
    return {
      msg: "min-vue",
    }
  },
}
