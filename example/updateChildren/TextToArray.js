import { h, ref } from "../../lib/guide-min-vue.esm.js"

export default {
  name: "TextToArray",
  setup() {
    const flag = ref(true)

    const handleClick = () => {
      console.log("TextToArray click")
      flag.value = !flag.value
    }
    return {
      flag,
      handleClick,
    }
  },
  render() {
    return this.flag
      ? h("div", { onClick: this.handleClick }, "click me")
      : h("div", {}, [h("p", {}, "我是一个p"), "我是一个文本"])
  },
}
