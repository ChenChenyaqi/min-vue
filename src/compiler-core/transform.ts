import { Element, Interpolation, Text } from "./ast"

type MixinNode = Element & Interpolation & Text

type Options = {
  nodeTransforms: ((node: MixinNode) => {})[]
}

export function transform(root: MixinNode, options: Options) {
  const context = createTransformContext(root, options)
  traverseNode(root, context)
}

function createTransformContext(root: MixinNode, options: Options) {
  const context = {
    root,
    nodeTransforms: options.nodeTransforms || [],
  }

  return context
}

type Context = ReturnType<typeof createTransformContext>

function traverseNode(node: MixinNode, context: Context) {
  context.nodeTransforms.forEach((fn) => fn(node))

  traverseChildren(node, context)
}

function traverseChildren(node: MixinNode, context: Context) {
  const children = node.children
  if (children) {
    for (let i = 0; i < children.length; i++) {
      const node = children[i]

      traverseNode(node, context)
    }
  }
}
