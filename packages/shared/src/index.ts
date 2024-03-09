export * from "./toDisplayString"

export function extend(origin, ...target) {
  return Object.assign(origin, ...target)
}

export function isObject(value) {
  return value !== null && typeof value === "object"
}

export function isString(value) {
  return typeof value === "string"
}

export function isArray(value) {
  return Array.isArray(value)
}

export function hasChanged(value, newValue) {
  return !Object.is(value, newValue)
}

export function convertStringToHTMLElement(
  rootContainer: string | Element
): Element {
  let rootElement = rootContainer
  if (typeof rootContainer === "string") {
    rootElement = document.querySelector(rootContainer) as Element
  }
  return rootElement as Element
}

export function hasOwn(val: object, key: string) {
  return Object.prototype.hasOwnProperty.call(val, key)
}

export function camelize(str: string) {
  return str.replace(/-(\w)/g, (_, c: string) => {
    return c ? c.toUpperCase() : ""
  })
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function toHandlerKey(str: string) {
  return str ? "on" + capitalize(str) : ""
}
