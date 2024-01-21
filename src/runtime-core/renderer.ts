import { isObject } from "../shared"
import {
  ComponentInstance,
  createComponentInstance,
  setupComponent,
} from "./component"
import { Text, VNode } from "./vnode"

export const Fragment = Symbol("Fragment")

export function render(vnode: VNode, container: Element) {
  patch(vnode, container)
}

function patch(vnode: VNode, container: Element) {
  switch (vnode.type) {
    case Fragment:
      processFragment(vnode, container)
      break
    case Text:
      processText(vnode, container)
      break
    default:
      if (typeof vnode.type === "string") {
        // 处理组件
        processElement(vnode, container)
      } else if (isObject(vnode.type)) {
        processComponent(vnode, container)
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

function processFragment(vnode: VNode, container: Element) {
  if (typeof vnode.children === "string") return
  vnode.children.forEach((child) => patch(child, container))
}

function processElement(vnode: VNode, container: Element) {
  mountElement(vnode, container)
}

function mountElement(initialVnode: VNode, container: Element) {
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
      patch(child, el)
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
