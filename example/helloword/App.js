import { h } from "../../lib/guide-min-vue.esm.js"

window.self = null
export const App = {
  render() {
    window.self = this
    return h("div", { id: "root", class: ["red", "hard"] }, [
      "hi, " + this.msg,
      "min-vue",
      h("p", "我是一个p"),
      h("p", "我是一个p2"),
    ])
  },
  setup() {
    return {
      msg: "min-vue",
    }
  },
}
