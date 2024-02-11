import { VNode } from "./vnode"

export function shouldUpdateComponent(newVNode: VNode, oldVNode: VNode | null) {
  const { props: oldProps } = oldVNode || {}
  const { props: newProps } = newVNode

  for (const key in newProps) {
    if (newProps[key] !== oldProps?.[key]) {
      return true
    }
  }
  return false
}
