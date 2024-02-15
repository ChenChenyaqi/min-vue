import { Element, Interpolation, NodeTypes, Text } from "./ast"
import { TO_DISPLAY_STRING } from "./runtimeHelpers"

type MixinNode = Element &
  Interpolation &
  Text & { codegenNode?: Element; helpers: string[] }

type Options = {
  nodeTransforms?: ((node: MixinNode) => {})[]
}

export function transform(root: MixinNode, options: Options = {}) {
  const context = createTransformContext(root, options)
  traverseNode(root, context)

  createRootCodegen(root)

  root.helpers = [...context.helpers.keys()]
}

function createRootCodegen(root: MixinNode) {
  root.codegenNode = root.children[0]
}

function createTransformContext(root: MixinNode, options: Options) {
  const context = {
    root,
    nodeTransforms: options.nodeTransforms || [],
    helpers: new Map(),
    helper(key: Symbol) {
      context.helpers.set(key, 1)
    },
  }

  return context
}

type Context = ReturnType<typeof createTransformContext>

function traverseNode(node: MixinNode, context: Context) {
  context.nodeTransforms.forEach((fn) => fn(node))

  switch (node.type) {
    case NodeTypes.INTERPOLATION:
      context.helper(TO_DISPLAY_STRING)
      break
    case NodeTypes.ROOT:
    case NodeTypes.ELEMENT:
      traverseChildren(node, context)
      break
    default:
      break
  }
}

function traverseChildren(node: MixinNode, context: Context) {
  const children = node.children
  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    traverseNode(node, context)
  }
}
