import {
  getCurrentInstance,
  h,
  ref,
  nextTick,
} from "../../lib/guide-min-vue.esm.js"

export const App = {
  name: "App",
  setup() {
    const msg = ref("hello world")
    const handleClick = () => {
      msg.value = "你好 世界!"
    }
    const instance = getCurrentInstance()

    const count = ref(1)
    const handleClick2 = () => {
      for (let i = 0; i < 100; i++) {
        count.value = i
      }
      console.log(instance)
      debugger
      nextTick(() => {
        console.log(instance)
        debugger
      })
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
      h("span", "count: " + this.count),
      h("button", { onClick: this.handleClick2 }, "click me"),
    ])
  },
}
