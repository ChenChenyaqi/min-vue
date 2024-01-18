import { convertStringToHTMLElement } from "../shared/index"
import { Component } from "./h"
import { render } from "./renderer"
import { createVNode } from "./vnode"

export function createApp(rootComponent: Component) {
  return {
    mount(_rootContainer: string | Element) {
      debugger
      const vnode = createVNode(rootComponent)
      const rootContainer = convertStringToHTMLElement(_rootContainer)
      render(vnode, rootContainer)
    },
  }
}
