import { effect } from "../reactivity/effect"
import { isArray, isObject, isString } from "../shared"
import {
  ComponentInstance,
  createComponentInstance,
  setupComponent,
} from "./component"
import { shouldUpdateComponent } from "./componentUpdateUtils"
import { createAppAPI } from "./createApp"
import { Text, VNode } from "./vnode"

export const Fragment = Symbol("Fragment")

interface Options {
  createElement: (type: string) => any
  patchProp: (el: any, key: string, oldValue: any, newValue: any) => void
  insert: (el: any, container: any, anchor: any) => void
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
    patch(vnode, null, container, undefined, null as any)
  }

  function patch(
    newVNode: VNode,
    preVNode: VNode | null,
    container: Element,
    parentComponent?: ComponentInstance,
    anchor?: Element
  ) {
    switch (newVNode.type) {
      case Fragment:
        processFragment(newVNode, preVNode, container, parentComponent)
        break
      case Text:
        processText(newVNode, preVNode, container, anchor)
        break
      default:
        if (typeof newVNode.type === "string") {
          // 处理组件
          processElement(newVNode, preVNode, container, parentComponent, anchor)
        } else if (isObject(newVNode.type)) {
          processComponent(newVNode, preVNode, container, parentComponent)
        }
        break
    }
  }
  function processText(
    newVNode: VNode,
    preVNode: VNode | null,
    container: Element,
    anchor?: Element
  ) {
    const { children } = newVNode
    const textNode = (newVNode.el = hostCreateTextNode(
      children as string
    ) as any)
    hostInsert(textNode, container, anchor)
  }

  function processFragment(
    newVNode: VNode,
    preVNode: VNode | null,
    container: Element,
    parentComponent?: ComponentInstance,
    anchor?: Element
  ) {
    if (typeof newVNode.children === "string") return
    newVNode.children.forEach((child) =>
      patch(child, null, container, parentComponent, anchor)
    )
  }

  function processElement(
    newVNode: VNode,
    preVNode: VNode | null,
    container: Element,
    parentComponent?: ComponentInstance,
    anchor?: Element
  ) {
    if (!preVNode) {
      mountElement(newVNode, container, parentComponent, anchor)
    } else {
      patchElement(newVNode, preVNode, parentComponent, anchor)
    }
  }

  function patchElement(
    newVNode: VNode,
    preVNode: VNode,
    parentComponent?: ComponentInstance,
    anchor?: Element
  ) {
    const oldProps = preVNode.props || EMPTY_OBJ
    const newProps = newVNode.props || EMPTY_OBJ

    const el = (newVNode.el = preVNode.el) as Element
    patchChildren(preVNode, newVNode, el, parentComponent, anchor)
    patchProps(el, oldProps, newProps)
  }

  function patchChildren(
    preVNode: VNode,
    newVNode: VNode,
    el: Element,
    parentComponent?: ComponentInstance,
    anchor?: Element
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
        mountChildren(newChildren as VNode[], el, parentComponent, anchor)
      } else if (isArray(preChildren)) {
        // diff array
        patchKeyedChildren(
          newChildren as VNode[],
          preChildren as VNode[],
          el,
          parentComponent,
          anchor
        )
      }
    }
  }

  function isSameKeyNode(n1: VNode, n2: VNode) {
    return n1.key === n2.key && n1.type === n2.type
  }

  function patchKeyedChildren(
    newChildren: VNode[],
    preChildren: VNode[],
    el: Element,
    parentComponent,
    parentAnchor?: Element
  ) {
    // 四个索引值
    let preStartIndex = 0
    let preEndIndex = preChildren.length - 1
    let newStartIndex = 0
    let newEndIndex = newChildren.length - 1
    // 四个索引指向的vnode节点
    let preStartVNode = preChildren[preStartIndex]
    let preEndVNode = preChildren[preEndIndex]
    let newStartVNode = newChildren[newStartIndex]
    let newEndVNode = newChildren[newEndIndex]

    while (preStartIndex <= preEndIndex && newStartIndex <= newEndIndex) {
      if (!preStartVNode) {
        preStartVNode = preChildren[++preStartIndex]
      } else if (!preEndVNode) {
        preEndVNode = preChildren[--preEndIndex]
      } else if (isSameKeyNode(preStartVNode, newStartVNode)) {
        patch(newStartVNode, preStartVNode, el, parentComponent, parentAnchor)
        preStartVNode = preChildren[++preStartIndex]
        newStartVNode = newChildren[++newStartIndex]
      } else if (isSameKeyNode(preEndVNode, newEndVNode)) {
        patch(newEndVNode, preEndVNode, el, parentComponent, parentAnchor)
        preEndVNode = preChildren[--preEndIndex]
        newEndVNode = newChildren[--newEndIndex]
      } else if (preStartVNode.key === newEndVNode.key) {
        patch(newEndVNode, preStartVNode, el, parentComponent, parentAnchor)
        hostInsert(preStartVNode.el, el, preEndVNode.el?.nextSibling)
        preStartVNode = preChildren[++preStartIndex]
        newEndVNode = newChildren[--newEndIndex]
      } else if (preEndVNode.key === newStartVNode.key) {
        patch(newStartVNode, preEndVNode, el, parentComponent, parentAnchor)
        hostInsert(preEndVNode.el, el, preStartVNode.el)
        preEndVNode = preChildren[--preEndIndex]
        newStartVNode = newChildren[++newStartIndex]
      } else {
        // 处理非理性的情况
        const indexInPre = preChildren.findIndex(
          (node) => node.key === newStartVNode.key
        )

        if (indexInPre > 0) {
          // 能在preChildren中找到newStarVNode，说明可以复用，移动旧节点
          const vnodeToMove = preChildren[indexInPre]
          patch(newStartVNode, vnodeToMove, el, parentComponent, parentAnchor)
          hostInsert(vnodeToMove.el, el, preStartVNode.el)
          ;(preChildren as any)[indexInPre] = undefined
        } else {
          // 找不到，说明是新的节点，进行挂载
          patch(
            newStartVNode,
            null,
            el,
            parentComponent,
            preStartVNode.el as Element
          )
        }
        newStartVNode = newChildren[++newStartIndex]
      }
    }

    // 检查是否还有遗留的节点
    if (preEndIndex < preStartIndex && newStartIndex <= newEndIndex) {
      // 有新增的节点要处理
      for (let i = newStartIndex; i <= newEndIndex; i++) {
        patch(
          newChildren[i],
          null,
          el,
          parentComponent,
          preStartVNode.el as Element
        )
      }
    } else if (newEndIndex < newStartIndex && preStartIndex <= preEndIndex) {
      // 有卸载的节点要处理
      const childWillUnmountList: VNode[] = []
      for (let i = preStartIndex; i <= preEndIndex; i++) {
        childWillUnmountList.push(preChildren[i])
      }
      unmountChildren(childWillUnmountList)
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
    parentComponent?: ComponentInstance,
    anchor?: Element
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
      mountChildren(children, el, parentComponent, anchor)
    }
    // 挂载
    hostInsert(el, container, anchor)
  }

  function mountChildren(
    children: VNode[],
    el: Element,
    parentComponent?: ComponentInstance,
    anchor?: Element
  ) {
    children.forEach((child) => {
      patch(child, null, el, parentComponent, anchor)
    })
  }

  function processComponent(
    newVNode: VNode,
    oldVNode: VNode | null,
    container: Element,
    parentComponent?: ComponentInstance,
    anchor?: Element
  ) {
    if (!oldVNode) {
      mountComponent(newVNode, container, parentComponent, anchor)
    } else {
      updateComponent(newVNode, oldVNode)
    }
  }

  function updateComponent(newVNode: VNode, oldVNode: VNode | null) {
    const instance = oldVNode?.component as ComponentInstance
    if (shouldUpdateComponent(newVNode, oldVNode)) {
      newVNode.component = instance
      instance.next = newVNode
      instance.update?.()
    } else {
      // 不更新就要重置
      newVNode.component = oldVNode?.component
      newVNode.el = oldVNode?.el as Element
      instance.vnode = newVNode
    }
  }

  function mountComponent(
    vnode: VNode,
    container: Element,
    parentComponent?: ComponentInstance,
    anchor?: Element
  ) {
    const instance = createComponentInstance(vnode, parentComponent)
    vnode.component = instance

    setupComponent(instance)
    setupRenderEffect(instance, vnode, container, anchor)
  }

  function setupRenderEffect(
    instance: ComponentInstance,
    vnode: VNode,
    container: Element,
    anchor?: Element
  ) {
    instance.update = effect(() => {
      if (!instance.isMounted) {
        // 挂载
        const { proxy } = instance
        const subTree = (instance.subTree = instance.render!.call(proxy))

        patch(subTree, null, container, instance, anchor)
        // 所有的element都已经处理完
        vnode.el = subTree.el
        instance.isMounted = true
      } else {
        // 更新
        // 更新props
        const { next: newVNode, vnode: preVNode } = instance
        if (newVNode) {
          newVNode.el = preVNode.el
          updateComponentPreRender(instance, newVNode)
        }

        const { proxy } = instance
        const subTree = instance.render!.call(proxy)
        const preSubTree = instance.subTree
        instance.subTree = subTree

        patch(subTree, preSubTree, container, instance, anchor)
      }
    })
  }

  function updateComponentPreRender(
    instance: ComponentInstance,
    newVNode: VNode
  ) {
    instance.vnode = newVNode
    instance.next = undefined
    instance.props = newVNode.props
  }

  return {
    createApp: createAppAPI(render),
  }
}
