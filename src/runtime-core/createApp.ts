import { convertStringToHTMLElement } from "../shared/index"
import { Component } from "./h"
import { createVNode } from "./vnode"

export function createAppAPI(render) {
  return function createApp(rootComponent: Component) {
    return {
      mount(_rootContainer: string | Element) {
        const vnode = createVNode(rootComponent)
        const rootContainer = convertStringToHTMLElement(_rootContainer)
        render(vnode, rootContainer)
      },
    }
  }
}
