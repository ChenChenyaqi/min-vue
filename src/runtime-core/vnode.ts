import { ShapeFlags } from "../shared/shapeFlags"
import { Component } from "./h"

export interface VNode {
  type: string | Component
  props: object
  children: VNode[] | string
  el: Element | null
  shapeFlag: ShapeFlags
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
    shapeFlag: getShapeFlag(type),
  }

  // 判断children
  if (typeof vnode.children === "string") {
    vnode.shapeFlag = vnode.shapeFlag | ShapeFlags.TEXT_CHILDREN
  } else {
    vnode.shapeFlag = vnode.shapeFlag | ShapeFlags.ARRAY_CHILDREN
    const hasStringChild = vnode.children.some((v) => typeof v === "string")
    if (hasStringChild) {
      vnode.shapeFlag = vnode.shapeFlag | ShapeFlags.TEXT_CHILDREN
    }
  }

  return vnode
}

function getShapeFlag(type: string | Component) {
  return typeof type === "string"
    ? ShapeFlags.ELEMENT
    : ShapeFlags.STATEFUL_COMPONENT
}
