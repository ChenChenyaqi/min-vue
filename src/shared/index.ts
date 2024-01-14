export function extend(origin, ...target) {
  return Object.assign(origin, ...target)
}

export function isObject(value) {
  return value !== null && typeof value === "object"
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
