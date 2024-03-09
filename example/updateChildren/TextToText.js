import { h, ref } from "../../packages/vue/dist/guide-min-vue.esm.js"

export default {
  name: "TextToText",
  setup() {
    const flag = ref(true)

    const handleClick = () => {
      console.log("TextToText  click")
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
      : h("div", {}, "click me!!!")
  },
}
