import { isObject } from "../shared"
import { ShapeFlags } from "../shared/shapeFlags"
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
  const { shapeFlag } = vnode
  if (shapeFlag & ShapeFlags.ELEMENT) {
    processElement(vnode, container)
  } else if (shapeFlag & ShapeFlags.STATEFUL_COMPONENT) {
    processComponent(vnode, container)
  }
}

function processElement(vnode: VNode, container: Element) {
  mountElement(vnode, container)
}

function mountElement(initialVnode: VNode, container: Element) {
  const el = (initialVnode.el = document.createElement(
    initialVnode.type as string
  ))
  const { children, props, shapeFlag } = initialVnode

  // 处理props
  for (const key in props) {
    const value = props[key]
    el.setAttribute(key, value)
  }
  // 处理children
  if (
    shapeFlag & ShapeFlags.TEXT_CHILDREN &&
    !(shapeFlag & ShapeFlags.ARRAY_CHILDREN)
  ) {
    el.textContent = children as string
  } else {
    ;(children as VNode[]).forEach((v) => {
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
  setupRenderEffect(instance, vnode, container)
}

function setupRenderEffect(
  instance: ComponentInstance,
  vnode: VNode,
  container: Element
) {
  const { proxy } = instance
  const subTree = instance.render!.call(proxy)

  patch(subTree, container)

  // 所有的element都已经处理完
  vnode.el = subTree.el
}
