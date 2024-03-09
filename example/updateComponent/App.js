import { h, ref } from "../../packages/vue/dist/guide-min-vue.esm.js"
import ComponentToComponent from "./ComponentToComponent.js"

export const App = {
  name: "App",
  setup() {
    const msg = ref("hello world")
    const handleClick = () => {
      msg.value = "你好 世界!"
    }

    const count = ref(1)
    const handleClick2 = () => {
      count.value = count.value + 1
    }
    return {
      msg,
      count,
      handleClick2,
      handleClick,
    }
  },
  render() {
    return h("div", {}, [
      h(ComponentToComponent, { msg: this.msg }),
      h("button", { onClick: this.handleClick }, "click me!"),
      h("hr"),
      h("div", { onClick: this.handleClick2 }, "App自身的属性: " + this.count),
    ])
  },
}
