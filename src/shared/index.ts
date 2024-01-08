export function extend(origin, ...target) {
  return Object.assign(origin, ...target)
}

export function isObject(value) {
  return value !== null && typeof value === "object"
}

export function hasChanged(value, newValue) {
  return !Object.is(value, newValue)
}
