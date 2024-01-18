import { Component } from "./h"

export interface VNode {
  type: string | Component
  props: object
  children: VNode[] | string
  el: Element | null
}

export function createVNode(
  type: string | Component,
  props?: object,
  children?: VNode[]
): VNode {
  const vnode: VNode = {
    type,
    props: props || {},
    children: children || [],
    el: null,
  }

  return vnode
}
