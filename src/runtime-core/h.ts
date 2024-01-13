import { createVNode, VNode } from "./vnode"

type Children = string | VNode[]

export interface Component {
  render: () => VNode
  setup: () => object
}

export function h(type: string)
export function h(type: string, props: object)
export function h(type: string, children: Children)
export function h(type: string, props: object, children: Children)
export function h(
  type: string | Component,
  propsOrChildren?: object | Children,
  _children?: Children
) {
  let props
  let children
  if (isProps(propsOrChildren)) {
    props = propsOrChildren
    children = []
  } else if (isChildren(propsOrChildren)) {
    props = {}
    children = propsOrChildren
  } else {
    props = {}
    children = []
  }
  if (_children) {
    children = _children
  }
  return createVNode(type, props, children)
}

function isProps(propsOrChildren?: object | Children) {
  return typeof propsOrChildren === "object" && !Array.isArray(propsOrChildren)
}

function isChildren(propsOrChildren?: object | Children) {
  return typeof propsOrChildren === "string" || Array.isArray(propsOrChildren)
}
