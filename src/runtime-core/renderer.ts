import { isObject } from "../shared"
import {
  ComponentInstance,
  createComponentInstance,
  setupComponent,
} from "./component"
import { Text, VNode } from "./vnode"

export const Fragment = Symbol("Fragment")

export function render(vnode: VNode, container: Element) {
  patch(vnode, container, undefined)
}

function patch(
  vnode: VNode,
  container: Element,
  parentComponent?: ComponentInstance
) {
  switch (vnode.type) {
    case Fragment:
      processFragment(vnode, container, parentComponent)
      break
    case Text:
      processText(vnode, container)
      break
    default:
      if (typeof vnode.type === "string") {
        // 处理组件
        processElement(vnode, container, parentComponent)
      } else if (isObject(vnode.type)) {
        processComponent(vnode, container, parentComponent)
      }
      break
  }
}

function processText(vnode: VNode, container: Element) {
  const { children } = vnode
  const textNode = (vnode.el = document.createTextNode(
    children as string
  ) as any)
  container.appendChild(textNode)
}

function processFragment(
  vnode: VNode,
  container: Element,
  parentComponent?: ComponentInstance
) {
  if (typeof vnode.children === "string") return
  vnode.children.forEach((child) => patch(child, container, parentComponent))
}

function processElement(
  vnode: VNode,
  container: Element,
  parentComponent?: ComponentInstance
) {
  mountElement(vnode, container, parentComponent)
}

function mountElement(
  initialVnode: VNode,
  container: Element,
  parentComponent?: ComponentInstance
) {
  const el = (initialVnode.el = document.createElement(
    initialVnode.type as string
  ))
  const { children, props } = initialVnode

  // 处理props
  const isOn = (key: string) => /^on[A-Z]/.test(key)
  for (const key in props) {
    const value = props[key]
    if (isOn(key)) {
      const event = key.slice(2).toLowerCase()
      el.addEventListener(event, value)
    } else {
      el.setAttribute(key, value)
    }
  }
  // 处理children
  if (typeof children === "string") {
    el.textContent = children as string
  } else if (Array.isArray(children)) {
    children.forEach((child) => {
      patch(child, el, parentComponent)
    })
  }
  // 挂载
  container.appendChild(el)
}

function processComponent(
  vnode: VNode,
  container: Element,
  parentComponent?: ComponentInstance
) {
  mountComponent(vnode, container, parentComponent)
}

function mountComponent(
  vnode: VNode,
  container: Element,
  parentComponent?: ComponentInstance
) {
  const instance = createComponentInstance(vnode, parentComponent)

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

  patch(subTree, container, instance)

  // 所有的element都已经处理完
  vnode.el = subTree.el
}
