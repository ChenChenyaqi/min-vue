import { NodeTypes, TagType } from "./ast"

interface Context {
  source: string
}
export function baseParse(content: string) {
  const context = createParserContext(content)

  return createRoot(parseChildren(context))
}

function parseChildren(context: Context) {
  const nodes: any[] = []

  let node
  // {{}}
  const s = context.source
  if (s.startsWith("{{")) {
    node = parseInterpolation(context)
  } else if (s[0] === "<") {
    // element
    if (/[a-z]/i.test(s[1])) {
      node = parseElement(context)
    }
  }
  nodes.push(node)

  return nodes
}

// 处理element
function parseElement(context: Context) {
  const element = parseTag(context, TagType.START)
  parseTag(context, TagType.END)
  return element
}

function parseTag(context: Context, tagType: TagType) {
  const match = /^<\/?([a-z]*)/i.exec(context.source) as RegExpExecArray
  const tag = match[1]
  advanceBy(context, match[0].length)
  advanceBy(context, 1)

  if (tagType === TagType.END) return
  return {
    type: NodeTypes.ELEMENT,
    tag,
  }
}

// 处理插值
function parseInterpolation(context: Context) {
  const openDelimiter = "{{"
  const closeDelimiter = "}}"

  const closeIndex = context.source.indexOf(
    closeDelimiter,
    openDelimiter.length
  )

  advanceBy(context, openDelimiter.length)

  const rawContentLength = closeIndex - openDelimiter.length
  const rawContent = context.source.slice(0, rawContentLength)
  const content = rawContent.trim()

  advanceBy(context, rawContentLength + closeDelimiter.length)

  return {
    type: NodeTypes.INTERPOLATION,
    content: {
      type: NodeTypes.SIMPLE_EXPRESSION,
      content,
    },
  }
}

// 推进删除
function advanceBy(context: Context, length: number) {
  context.source = context.source.slice(length)
}

function createRoot(children) {
  return {
    children,
  }
}

function createParserContext(content: string): Context {
  return {
    source: content,
  }
}
