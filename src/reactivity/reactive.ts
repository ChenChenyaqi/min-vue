import { trick, trigger } from "./effect"

export function reactive(raw) {
  return new Proxy<typeof raw>(raw, {
    get(target, key, receiver) {
      const res = Reflect.get(target, key, receiver)
      // 依赖收集
      trick(target, key)
      return res
    },
    set(target, key, newValue, receiver) {
      const res = Reflect.set(target, key, newValue, receiver)
      // 触发依赖
      trigger(target, key)
      return res
    },
  })
}

export function readonly(raw) {
  return new Proxy<typeof raw>(raw, {
    get(target, key, receiver) {
      const res = Reflect.get(target, key, receiver)
      // 依赖收集
      trick(target, key)
      return res
    },
    set(target, key, newValue, receiver) {
      return true
    },
  })
}
