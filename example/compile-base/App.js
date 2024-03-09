import { h, ref } from "../../packages/vue/dist/guide-min-vue.esm.js"

export const App = {
  name: "App",
  template: "<div>hi, {{message}}, count: {{count}}</div>",
  setup() {
    const message = ref("min-vue")
    const count = (window.count = ref(1))
    return {
      message,
      count,
    }
  },
}
