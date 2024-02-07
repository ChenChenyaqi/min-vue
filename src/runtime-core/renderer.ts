import { effect } from "../reactivity/effect"
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
  patchProp: (el: any, key: string, oldValue: any, newValue: any) => void
  insert: (el: any, container: any) => void
  createTextNode: (content: string) => any
}

export function createRenderer(options: Options) {
  const { createElement, patchProp, insert, createTextNode } = options

  function render(vnode: VNode, container: Element) {
    patch(vnode, null, container, undefined)
  }

  function patch(
    newVNode: VNode,
    preVNode: VNode | null,
    container: Element,
    parentComponent?: ComponentInstance
  ) {
    switch (newVNode.type) {
      case Fragment:
        processFragment(newVNode, preVNode, container, parentComponent)
        break
      case Text:
        processText(newVNode, preVNode, container)
        break
      default:
        if (typeof newVNode.type === "string") {
          // 处理组件
          processElement(newVNode, preVNode, container, parentComponent)
        } else if (isObject(newVNode.type)) {
          processComponent(newVNode, preVNode, container, parentComponent)
        }
        break
    }
  }

  function processText(
    newVNode: VNode,
    preVNode: VNode | null,
    container: Element
  ) {
    const { children } = newVNode
    const textNode = (newVNode.el = createTextNode(children as string) as any)
    insert(textNode, container)
  }

  function processFragment(
    newVNode: VNode,
    preVNode: VNode | null,
    container: Element,
    parentComponent?: ComponentInstance
  ) {
    if (typeof newVNode.children === "string") return
    newVNode.children.forEach((child) =>
      patch(child, null, container, parentComponent)
    )
  }

  function processElement(
    newVNode: VNode,
    preVNode: VNode | null,
    container: Element,
    parentComponent?: ComponentInstance
  ) {
    if (!preVNode) {
      mountElement(newVNode, container, parentComponent)
    } else {
      patchElement(newVNode, preVNode, container)
    }
  }

  function patchElement(newVNode: VNode, preVNode: VNode, container: Element) {
    // props
    const oldProps = preVNode.props || EMPTY_OBJ
    const newProps = newVNode.props || EMPTY_OBJ

    const el = (newVNode.el = preVNode.el) as Element

    patchProps(el, oldProps, newProps)
    // children
  }
  const EMPTY_OBJ = {}
  function patchProps(el: Element, oldProps, newProps) {
    if (oldProps === newProps) {
      return
    }
    for (const key in newProps) {
      const preProp = oldProps[key]
      const nextProp = newProps[key]

      if (preProp !== nextProp) {
        patchProp(el, key, preProp, nextProp)
      }
    }
    if (oldProps === EMPTY_OBJ) {
      return
    }
    // 移除不存在的props
    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProp(el, key, oldProps[key], null)
      }
    }
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
      patchProp(el, key, null, value)
    }
    // 处理children
    if (typeof children === "string") {
      el.textContent = children as string
    } else if (Array.isArray(children)) {
      children.forEach((child) => {
        patch(child, null, el, parentComponent)
      })
    }
    // 挂载
    insert(el, container)
  }

  function processComponent(
    newVNode: VNode,
    oldVNode: VNode | null,
    container: Element,
    parentComponent?: ComponentInstance
  ) {
    mountComponent(newVNode, container, parentComponent)
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
    effect(() => {
      if (!instance.isMounted) {
        // 挂载
        const { proxy } = instance
        const subTree = (instance.subTree = instance.render!.call(proxy))

        patch(subTree, null, container, instance)
        // 所有的element都已经处理完
        vnode.el = subTree.el
        instance.isMounted = true
      } else {
        // 更新
        const { proxy } = instance
        const subTree = instance.render!.call(proxy)
        const preSubTree = instance.subTree
        instance.subTree = subTree

        patch(subTree, preSubTree, container, instance)
      }
    })
  }

  return {
    createApp: createAppAPI(render),
  }
}
