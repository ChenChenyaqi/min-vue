import { mutableHandlers, readonlyHandlers } from "./baseHandler"

export const enum ReactiveFlags {
  IS_REACTIVE = "__v_isReactive",
  IS_READONLY = "__v_isReadonly",
}

export function reactive(raw) {
  return createActiveObject(raw, mutableHandlers)
}

export function readonly(raw) {
  return createActiveObject(raw, readonlyHandlers)
}

function createActiveObject(raw, baseHandlers) {
  return new Proxy(raw, baseHandlers)
}

export function isReactive(observed) {
  return !!observed[ReactiveFlags.IS_REACTIVE]
}

export function isReadonly(observed) {
  return !!observed[ReactiveFlags.IS_READONLY]
}
