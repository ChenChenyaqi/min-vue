import { h } from "../../packages/vue/dist/guide-min-vue.esm.js"

export const Foo = {
  setup(props, { emit }) {
    console.log(props)

    const emitAdd = () => {
      console.log("emit add")
      emit("add", 1, 2)
      emit("addFoo", 1, 2)
    }

    return {
      emitAdd,
    }
  },

  render() {
    const btn = h(
      "button",
      {
        onClick: this.emitAdd,
      },
      "emitAdd"
    )

    const foo = h("p", {}, "foo")

    return h("div", {}, [foo, btn])
  },
}
