import { ComponentInstance } from "./component"

export function initSlots(
  instance: ComponentInstance,
  children: any[] | object
) {
  // array or object
  // instance.slots = Array.isArray(children) ? children : [children]

  const slots = {}
  for (const key in children) {
    const value = children[key]
    slots[key] = Array.isArray(value)
      ? value
      : typeof value === "function"
      ? value
      : [value]
  }
  instance.slots = slots
}
