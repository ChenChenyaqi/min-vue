import { Component } from "./h"

export const Text = Symbol("Text")
export interface VNode {
  type: string | Component | Symbol
  props: object
  children: VNode[] | string
  el: Element | null
}

export function createVNode(
  type: string | Component | Symbol,
  props?: object,
  children?: VNode[] | string
): VNode {
  const vnode: VNode = {
    type,
    props: props || {},
    children: children || [],
    el: null,
  }

  return vnode
}

export function createTextVNode(content: string) {
  return createVNode(Text, {}, content)
}
