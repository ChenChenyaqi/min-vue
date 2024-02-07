import { h, ref } from "../../lib/guide-min-vue.esm.js"
import TextToText from "./TextToText.js"
import TextToArray from "./TextToArray.js"
import ArrayToText from "./ArrayToText.js"
import ArrayToArray from "./ArrayToArray.js"

export const App = {
  name: "App",
  setup() {
    return {}
  },
  render() {
    return h("div", {}, [
      h(TextToText),
      h("hr"),
      h(TextToArray),
      h("hr"),
      h(ArrayToText),
      h("hr"),
      h(ArrayToArray),
    ])
  },
}
