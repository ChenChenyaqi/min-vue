import { trick, trigger } from "./effect"
import { ReactiveFlags } from "./reactive"

const get = createGetter()
const set = createSetter()
const readonlyGet = createGetter(true)

function createGetter(isReadonly: boolean = false) {
  return function get(target, key, receiver) {
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    }
    const res = Reflect.get(target, key, receiver)
    if (!isReadonly) {
      trick(target, key)
    }
    return res
  }
}

function createSetter() {
  return function set(target, key, newValue, receiver) {
    const res = Reflect.set(target, key, newValue, receiver)
    // 触发依赖
    trigger(target, key)
    return res
  }
}

export const mutableHandlers = {
  get,
  set,
}

export const readonlyHandlers = {
  get: readonlyGet,
  set(target, key, newValue) {
    console.warn(`readonly 不能修改: 设置 ${target} 中的 ${key}时`)
    return true
  },
}
