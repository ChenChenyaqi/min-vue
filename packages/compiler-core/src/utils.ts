import { Element, NodeTypes } from "./ast"

export function isText(node: Element) {
  return node.type === NodeTypes.TEXT || node.type === NodeTypes.INTERPOLATION
}
