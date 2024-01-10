import { convertStringToHTMLElement } from "../shared/index"
import { render } from "./renderer"
import { createVNode } from "./vnode"

export function createApp(rootComponent) {
  return {
    mount(_rootContainer: string | Element) {
      const vnode = createVNode(rootComponent)
      const rootContainer = convertStringToHTMLElement(_rootContainer)
      render(vnode, rootContainer)
    },
  }
}
