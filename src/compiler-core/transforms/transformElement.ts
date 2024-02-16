import { Element, NodeTypes } from "../ast"
import { CREATE_ELEMENT_VNODE } from "../runtimeHelpers"

export function transformElement(node: Element, context) {
  if (node.type === NodeTypes.ELEMENT) {
    return () => {
      context.helper(CREATE_ELEMENT_VNODE)
      // 中间处理层

      // tag
      const vnodeTag = node.tag
      // props
      const vnodeProps = null
      // children
      const children = node.children
      const vnodeChildren = children[0]

      const vnodeElement = {
        type: NodeTypes.ELEMENT,
        tag: vnodeTag,
        props: vnodeProps,
        children: vnodeChildren,
      }

      node.codegenNode = vnodeElement
    }
  }
}
