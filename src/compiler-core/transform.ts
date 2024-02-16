import { Element, Interpolation, NodeTypes, Text } from "./ast"
import { TO_DISPLAY_STRING } from "./runtimeHelpers"

type MixinNode = Element &
  Interpolation &
  Text & { codegenNode?: Element; helpers: string[] }

type Options = {
  nodeTransforms?: ((node: any, context: any) => {})[]
}

export function transform(root: MixinNode, options: Options = {}) {
  const context = createTransformContext(root, options)
  traverseNode(root, context)

  createRootCodegen(root)

  root.helpers = [...context.helpers.keys()]
}

function createRootCodegen(root: MixinNode) {
  const child = root.children[0]
  if (child.type === NodeTypes.ELEMENT) {
    root.codegenNode = child.codegenNode
  } else {
    root.codegenNode = root.children[0]
  }
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
  const nodeTransforms = context.nodeTransforms
  const exitFns: any[] = []
  for (let i = 0; i < nodeTransforms.length; i++) {
    const transform = nodeTransforms[i]
    const onExit = transform(node, context)
    if (onExit) exitFns.push(onExit)
  }

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

  let i = exitFns.length
  while (i--) {
    exitFns[i]()
  }
}

function traverseChildren(node: MixinNode, context: Context) {
  const children = node.children
  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    traverseNode(node, context)
  }
}
