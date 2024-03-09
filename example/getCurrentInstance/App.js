import {
  createTextVNode,
  h,
  getCurrentInstance,
} from "../../packages/vue/dist/guide-min-vue.esm.js"
import { Foo } from "./Foo.js"

export const App = {
  render() {
    return h("div", {}, [h("p", {}, "currentInstance demo")])
  },
  setup() {
    const instance = getCurrentInstance()
    console.log("App: ", instance)
  },
}
