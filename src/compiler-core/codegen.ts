import {
  CREATE_ELEMENT_VNODE,
  TO_DISPLAY_STRING,
  helperMapName,
} from "./runtimeHelpers"
import { Element, Interpolation, NodeTypes, Text } from "./ast"
import { isString } from "../shared"

export function generate(ast) {
  const context = createCodegenContext()
  const { push } = context

  // 前导码
  genFunctionPreamble(ast, context)

  const functionName = "render"
  const args = ["_ctx", "_cache"]
  const signature = args.join(", ")

  push(`function ${functionName}(${signature}){`)

  push("return ")
  genNode(ast.codegenNode, context)
  push("}")

  return {
    code: context.code,
  }
}

function genFunctionPreamble(ast, context) {
  const { push } = context
  const VueBinging = "Vue"
  const aliasHelper = (s) => `${helperMapName[s]}: _${helperMapName[s]}`
  if (ast.helpers.length) {
    push(
      `const { ${ast.helpers.map(aliasHelper).join(", ")} } = ${VueBinging};`
    )
  }
  push("return ")
}

function genNode(node, context) {
  switch (node.type) {
    case NodeTypes.TEXT:
      genText(node, context)
      break
    case NodeTypes.INTERPOLATION:
      genInterpolation(node, context)
      break
    case NodeTypes.SIMPLE_EXPRESSION:
      genExpression(node, context)
      break
    case NodeTypes.ELEMENT:
      genElement(node, context)
      break
    case NodeTypes.COMPOUND_EXPRESSION:
      genCompoundExpression(node, context)
      break
    default:
      break
  }
}

function genCompoundExpression(node, context) {
  const { push } = context
  const children = node.children
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (isString(child)) {
      push(child)
    } else {
      genNode(child, context)
    }
  }
}

function genElement(node: Element, context) {
  const { push, helper } = context
  const { tag, children } = node
  console.log(children)
  push(`${helper(CREATE_ELEMENT_VNODE)}("${tag}", null, `)
  genNode(children, context)
  push(")")
}

function genText(node: Text, context) {
  const { push } = context
  push(`'${node.content}'`)
}

function genInterpolation(node: Interpolation, context) {
  const { push, helper } = context
  push(`${helper(TO_DISPLAY_STRING)}(`)
  genNode(node.content, context)
  push(")")
}

function genExpression(node: Interpolation["content"], context) {
  const { push } = context
  push(`${node.content}`)
}

function createCodegenContext() {
  const context = {
    code: "",
    push(source: string) {
      context.code += source
    },
    helper(key) {
      return `_${helperMapName[key]}`
    },
  }

  return context
}
