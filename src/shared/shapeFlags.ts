// 0001 -> element
// 0010 -> stateful
// 0100 -> text_children
// 1000 -> array_children
// 1010 -> array_children & stateful

// 修改
// 0000 | 0001  -> 0001

// 查找
// 0001 & 0001 -> true
// 0010 & 0001 -> false
// 1100 & 0100 -> true
// 1100 & 1000 -> true
// 1100 & 0100 -> !(1000 & 1000) -> false

export const enum ShapeFlags {
  ELEMENT = 1, // 0001
  STATEFUL_COMPONENT = 1 << 1, // 0010
  TEXT_CHILDREN = 1 << 2, // 0100
  ARRAY_CHILDREN = 1 << 3, // 1000
}
