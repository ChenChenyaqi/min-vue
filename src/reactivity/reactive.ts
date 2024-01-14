import { isObject } from "../shared"
import {
  mutableHandlers,
  readonlyHandlers,
  shallowReadonlyHandlers,
} from "./baseHandler"

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

export function shallowReadonly(raw) {
  return createActiveObject(raw, shallowReadonlyHandlers)
}

function createActiveObject(target, baseHandlers) {
  if (!isObject(target)) {
    console.warn(`target ${target} 必须是一个对象`)
  }
  return new Proxy(target, baseHandlers)
}

export function isReactive(observed) {
  return !!observed[ReactiveFlags.IS_REACTIVE]
}

export function isReadonly(observed) {
  return !!observed[ReactiveFlags.IS_READONLY]
}

export function isProxy(value) {
  return isReactive(value) || isReadonly(value)
}
