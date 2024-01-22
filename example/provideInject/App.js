import { h, provide, inject } from "../../lib/guide-min-vue.esm.js"

const Provider = {
  name: "Provider",
  setup() {
    provide("foo", "fooVal")
    provide("bar", "barVal")
  },
  render() {
    return h("div", {}, [h("p", {}, "Provider"), h(Middle)])
  },
}

const Middle = {
  name: "Middle",
  setup() {},
  render() {
    return h("div", {}, [h("div", "Middle"), h(Consumer)])
  },
}

const Consumer = {
  name: "Consumer",
  setup() {
    const foo = inject("foo")
    const bar = inject("bar")
    const baz = inject("baz", "bazVal")
    return {
      foo,
      bar,
      baz,
    }
  },
  render() {
    return h("div", {}, `Consumer: - ${this.foo} - ${this.bar} - ${this.baz}`)
  },
}

export const App = {
  name: "App",
  render() {
    return h("div", {}, [h(Provider)])
  },
  setup() {},
}
