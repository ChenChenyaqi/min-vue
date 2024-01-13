import { isObject } from "../shared"
import {
  ComponentInstance,
  createComponentInstance,
  setupComponent,
} from "./component"
import { VNode } from "./vnode"

export function render(vnode: VNode, container: Element) {
  patch(vnode, container)
}

function patch(vnode: VNode, container: Element) {
  // 处理组件
  if (typeof vnode.type === "string") {
    processElement(vnode, container)
  } else if (isObject(vnode.type)) {
    processComponent(vnode, container)
  }
}

function processElement(vnode: VNode, container: Element) {
  mountElement(vnode, container)
}

function mountElement(vnode: VNode, container: Element) {
  const el = document.createElement(vnode.type as string)
  const { children, props } = vnode

  // 处理props
  for (const key in props) {
    const value = props[key]
    el.setAttribute(key, value)
  }
  // 处理children
  if (typeof children === "string") {
    el.textContent = children
  } else {
    children.forEach((v) => {
      if (typeof v === "string") {
        el.textContent = el.textContent + v
      } else {
        patch(v, el)
      }
    })
  }
  // 挂载
  container.appendChild(el)
}

function processComponent(vnode: VNode, container: Element) {
  mountComponent(vnode, container)
}

function mountComponent(vnode: VNode, container: Element) {
  const instance = createComponentInstance(vnode)

  setupComponent(instance)
  setupRenderEffect(instance, container)
}

function setupRenderEffect(instance: ComponentInstance, container: Element) {
  const subTree = instance.render!()

  patch(subTree, container)
}
