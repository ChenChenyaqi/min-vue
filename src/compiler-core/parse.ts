import { NodeTypes, TagType } from "./ast"

interface Context {
  source: string
}

interface Element {
  tag: string
  type: NodeTypes
  children: any[]
}

export function baseParse(content: string) {
  const context = createParserContext(content)

  return createRoot(parseChildren(context, []))
}

function parseChildren(context: Context, ancestors: Element[]) {
  const nodes: any[] = []

  while (!isEnd(context, ancestors)) {
    let node
    // {{}}
    const s = context.source
    if (s.startsWith("{{")) {
      node = parseInterpolation(context)
    } else if (s[0] === "<") {
      // element
      if (/[a-z]/i.test(s[1])) {
        node = parseElement(context, ancestors)
      }
    }
    // text
    if (!node) {
      node = parseText(context, ancestors)
    }
    if (node) {
      nodes.push(node)
    }
  }

  return nodes
}

function isEnd(context: Context, ancestors: Element[]) {
  // 1. source有值的时候
  // 2. 遇到结束标签的时候
  const s = context.source
  const expectTag = ancestors[ancestors.length - 1]?.tag
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const tag = ancestors[i].tag
    if (s.startsWith(`</${tag}>`)) {
      if (tag !== expectTag) {
        throw Error(`不存在结束标签 </${expectTag}>`)
      } else {
        return true
      }
    }
  }
  return !s
}

// 处理element
function parseElement(context: Context, ancestors: Element[]) {
  const element = parseTag(context, TagType.START) as Element

  ancestors.push(element)
  element.children = parseChildren(context, ancestors)
  ancestors.pop()

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
    children: [],
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
  const rawContent = parseTextData(context, rawContentLength)
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

// 处理text
function parseText(context: Context, ancestors: Element[]) {
  let endIndex = context.source.length
  const topElement = ancestors[ancestors.length - 1]
  const endToken = ["{{", `</${topElement?.tag || ""}>`]

  const index = endToken
    .map((token) => context.source.indexOf(token))
    .filter((i) => i !== -1)
    .sort((a, b) => a - b)[0]
  if (index) {
    endIndex = index
  }
  const content = parseTextData(context, endIndex)

  advanceBy(context, content.length)

  return {
    type: NodeTypes.TEXT,
    content,
  }
}

function parseTextData(context: Context, length: number) {
  return context.source.slice(0, length)
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
