import { isObject } from "../shared"
import {
  ComponentInstance,
  createComponentInstance,
  setupComponent,
} from "./component"
import { createAppAPI } from "./createApp"
import { Text, VNode } from "./vnode"

export const Fragment = Symbol("Fragment")

interface Options {
  createElement: (type: string) => any
  patchProp: (el: any, key: string, value: any) => void
  insert: (el: any, container: any) => void
  createTextNode: (content: string) => any
}

export function createRenderer(options: Options) {
  const { createElement, patchProp, insert, createTextNode } = options

  function render(vnode: VNode, container: Element) {
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
    const textNode = (vnode.el = createTextNode(children as string) as any)
    insert(textNode, container)
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
    const el = (initialVnode.el = createElement(initialVnode.type as string))
    const { children, props } = initialVnode

    // 处理props
    for (const key in props) {
      const value = props[key]
      patchProp(el, key, value)
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
    insert(el, container)
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

  return {
    createApp: createAppAPI(render),
  }
}
