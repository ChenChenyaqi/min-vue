import { Element, NodeTypes, createVNodeCall } from "../ast"

export function transformElement(node: Element, context) {
  if (node.type === NodeTypes.ELEMENT) {
    return () => {
      // 中间处理层

      // tag
      const vnodeTag = `"${node.tag}"`
      // props
      const vnodeProps = null
      // children
      const children = node.children
      const vnodeChildren = children[0]

      node.codegenNode = createVNodeCall(
        context,
        node.type,
        vnodeTag,
        vnodeProps,
        vnodeChildren
      )
    }
  }
}
