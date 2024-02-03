import { h, ref } from "../../lib/guide-min-vue.esm.js"

export const App = {
  name: "App",
  setup() {
    const count = ref(0)

    const handleClick = () => {
      count.value++
    }

    return {
      count,
      handleClick,
    }
  },
  render() {
    return h(
      "div",
      {
        id: "root",
      },
      [
        h("div", {}, "count: " + this.count), // 依赖收集
        h(
          "button",
          {
            onClick: this.handleClick,
          },
          "click me!"
        ),
      ]
    )
  },
}
