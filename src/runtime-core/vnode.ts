import { Component } from "./h"

export interface VNode {
  type: string | Component
  props: object
  children: VNode[] | string
}

export function createVNode(
  type: string | Component,
  props?: object,
  children?: VNode[]
): VNode {
  const vnode = {
    type,
    props: props || {},
    children: children || [],
  }

  return vnode
}
