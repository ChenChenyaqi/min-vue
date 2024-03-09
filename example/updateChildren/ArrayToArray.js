import { h, ref } from "../../packages/vue/dist/guide-min-vue.esm.js"

export default {
  name: "ArrayToArray",
  setup() {
    const flag = ref(true)

    const handleClick = () => {
      console.log("ArrayToArray click")
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
          h("a", { href: "xx" }, "我是一个a"),
          h("div", {}, "我是一个div3"),
        ])
      : h("div", {}, [
          h("div", {}, "我是一个div3"),
          h("div", {}, "我是一个div1"),
          h("div", {}, "我是一个div2"),
          h("a", { href: "xx" }, "我是一个a"),
        ])
  },
}
