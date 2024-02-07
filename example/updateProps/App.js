import { h, ref } from "../../lib/guide-min-vue.esm.js"

export const App = {
  name: "App",
  setup() {
    const flag = ref(true)
    const handleClick = () => {
      flag.value = !flag.value
      console.log("click!")
    }
    return {
      flag,
      handleClick,
    }
  },
  render() {
    return this.flag
      ? h(
          "div",
          {
            id: "root",
            onClick: this.handleClick,
            style: "background-color: #bfa",
          },
          "click me"
        )
      : h("div", {
          onClick: this.handleClick,
          style: "background-color: #afe",
        })
  },
}
