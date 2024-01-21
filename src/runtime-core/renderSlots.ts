import { Fragment } from "./renderer"
import { createVNode } from "./vnode"

export function renderSlots(slots, name, props) {
  const slot = slots[name]
  if (slot) {
    let renderSlot = slot
    if (typeof slot === "function") {
      renderSlot = slot(props)
      renderSlot = Array.isArray(renderSlot) ? renderSlot : [renderSlot]
    }
    return createVNode(Fragment, {}, renderSlot)
  }
  return {}
}
