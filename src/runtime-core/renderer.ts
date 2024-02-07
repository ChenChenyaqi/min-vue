import { effect } from "../reactivity/effect"
import { isArray, isObject, isString } from "../shared"
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
  remove: (child: any) => any
  setElementText: (el, text) => any
}

export function createRenderer(options: Options) {
  const {
    createElement: hostCreateElement,
    patchProp: hostPatchProp,
    insert: hostInsert,
    createTextNode: hostCreateTextNode,
    remove: hostRemove,
    setElementText: hostSetElementText,
  } = options

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
    const textNode = (newVNode.el = hostCreateTextNode(
      children as string
    ) as any)
    hostInsert(textNode, container)
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
      patchElement(newVNode, preVNode, parentComponent)
    }
  }

  function patchElement(
    newVNode: VNode,
    preVNode: VNode,
    parentComponent?: ComponentInstance
  ) {
    const oldProps = preVNode.props || EMPTY_OBJ
    const newProps = newVNode.props || EMPTY_OBJ

    const el = (newVNode.el = preVNode.el) as Element
    patchChildren(preVNode, newVNode, el, parentComponent)
    patchProps(el, oldProps, newProps)
  }

  function patchChildren(
    preVNode: VNode,
    newVNode: VNode,
    el: Element,
    parentComponent?: ComponentInstance
  ) {
    const newChildren = newVNode.children
    const preChildren = preVNode.children

    // 新children是文本
    if (isString(newChildren)) {
      if (isArray(preChildren)) {
        // 把老children清空
        unmountChildren(preChildren as VNode[])
      }
      if (newChildren !== preChildren) {
        // 更新text
        hostSetElementText(el, newChildren)
      }
    } else if (isArray(newChildren)) {
      if (isString(preChildren)) {
        hostSetElementText(el, "")
        mountChildren(newChildren as VNode[], el, parentComponent)
      } else if (isArray(preChildren)) {
        // diff
      }
    }
  }

  function unmountChildren(children: VNode[]) {
    for (let i = 0; i < children.length; i++) {
      const el = children[i].el
      hostRemove(el)
    }
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
        hostPatchProp(el, key, preProp, nextProp)
      }
    }
    if (oldProps === EMPTY_OBJ) {
      return
    }
    // 移除不存在的props
    for (const key in oldProps) {
      if (!(key in newProps)) {
        hostPatchProp(el, key, oldProps[key], null)
      }
    }
  }

  function mountElement(
    initialVnode: VNode,
    container: Element,
    parentComponent?: ComponentInstance
  ) {
    const el = (initialVnode.el = hostCreateElement(
      initialVnode.type as string
    ))
    const { children, props } = initialVnode

    // 处理props
    for (const key in props) {
      const value = props[key]
      hostPatchProp(el, key, null, value)
    }
    // 处理children
    if (typeof children === "string") {
      el.textContent = children as string
    } else if (Array.isArray(children)) {
      mountChildren(children, el, parentComponent)
    }
    // 挂载
    hostInsert(el, container)
  }

  function mountChildren(
    children: VNode[],
    el: Element,
    parentComponent?: ComponentInstance
  ) {
    children.forEach((child) => {
      patch(child, null, el, parentComponent)
    })
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
