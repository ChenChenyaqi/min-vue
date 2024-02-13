export interface Element {
  tag: string
  type: NodeTypes
  children: any[]
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
}

export enum TagType {
  START,
  END,
}
