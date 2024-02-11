import { h, ref } from "../../lib/guide-min-vue.esm.js"

export default {
  name: "ComponentToComponent",
  setup(props) {
    return {}
  },
  render() {
    return h("div", "我接受到的props中的msg：" + this.$props.msg)
  },
}
