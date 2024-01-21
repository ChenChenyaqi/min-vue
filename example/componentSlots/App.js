import { createTextVNode, h } from "../../lib/guide-min-vue.esm.js"
import { Foo } from "./Foo.js"

export const App = {
  render() {
    return h("div", { id: "root", class: ["red", "hard"] }, [
      h(
        Foo,
        {
          count: 1,
        },
        {
          header: ({ haha }) => [
            h("p", {}, "header" + haha),
            createTextVNode("hihi"),
          ],
          footer: h("p", {}, [createTextVNode("footer")]),
        }
      ),
    ])
  },
  setup() {
    return {
      msg: "min-vue",
    }
  },
}
