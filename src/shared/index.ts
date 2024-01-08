export function extend(origin, target) {
  Object.assign(origin, target)
}

export function isObject(value) {
  return value !== null && typeof value === "object"
}
