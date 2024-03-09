import { CREATE_ELEMENT_VNODE } from "./runtimeHelpers"

export interface Element {
  tag: string
  type: NodeTypes
  props?: any
  children: any[]
  codegenNode?: any
}

export interface Interpolation {
  type: NodeTypes
  content: {
    type: NodeTypes
    content: string
  }
}

export interface Text {
  type: NodeTypes
  content: string
}

export type Node = Element | Interpolation | Text

export enum NodeTypes {
  INTERPOLATION,
  SIMPLE_EXPRESSION,
  ELEMENT,
  TEXT,
  ROOT,
  COMPOUND_EXPRESSION,
}

export enum TagType {
  START,
  END,
}

export function createVNodeCall(
  context,
  type: NodeTypes,
  tag,
  props,
  children
) {
  context.helper(CREATE_ELEMENT_VNODE)
  return {
    type,
    tag,
    props,
    children,
  }
}
