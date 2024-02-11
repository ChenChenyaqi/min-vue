import { Component } from "./h"

export const Text = Symbol("Text")
export interface VNode {
  type: string | Component | Symbol
  props: object
  children: VNode[] | string
  el: Element | null
  key?: string
}

export function createVNode(
  type: string | Component | Symbol,
  props?: any,
  children?: VNode[] | string
): VNode {
  const vnode: VNode = {
    type,
    props: props || {},
    children: children || [],
    el: null,
    key: props?.key,
  }

  return vnode
}

export function createTextVNode(content: string) {
  return createVNode(Text, {}, content)
}
