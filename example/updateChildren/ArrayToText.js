import { h, ref } from "../../lib/guide-min-vue.esm.js"

export default {
  name: "ArrayToText",
  setup() {
    const flag = ref(true)

    const handleClick = () => {
      console.log("ArrayToText click")
      flag.value = !flag.value
    }
    return {
      flag,
      handleClick,
    }
  },
  render() {
    return this.flag
      ? h("div", { onClick: this.handleClick }, [
          h("div", {}, "我是一个div1"),
          h("div", {}, "我是一个div2"),
          h("div", {}, "我是一个div3"),
        ])
      : h("div", {}, "我是文本")
  },
}
