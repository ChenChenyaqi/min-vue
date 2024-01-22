import { getCurrentInstance } from "./component"

export function provide(key, value) {
  const currentInstance = getCurrentInstance()
  if (!currentInstance) return
  const parentProvides = currentInstance.parent?.provides
  if (parentProvides) {
    let { provides } = currentInstance
    if (provides === parentProvides) {
      provides = currentInstance.provides = Object.create(parentProvides)
    }
    if (provides) provides[key] = value
  }
}

export function inject(key, defaultVal) {
  const currentInstance = getCurrentInstance()
  if (!currentInstance) return
  const parentProvides = currentInstance.parent?.provides
  if (parentProvides)
    return (
      parentProvides[key] ||
      (typeof defaultVal === "function" ? defaultVal() : defaultVal)
    )
}
