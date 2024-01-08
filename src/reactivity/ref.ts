import { hasChanged, isObject } from "../shared"
import { trackEffect, triggerEffect } from "./effect"
import { reactive } from "./reactive"

class RefImpl {
  private _value: any
  private depsSet
  private _rowValue: any
  public __v_isRef = true
  constructor(value) {
    this._value = convert(value)
    this._rowValue = value
    this.depsSet = new Set()
  }

  get value(): any {
    trackEffect(this.depsSet)
    return this._value
  }

  set value(newValue: any) {
    if (hasChanged(this._rowValue, newValue)) {
      this._value = convert(newValue)
      this._rowValue = newValue
      triggerEffect(this.depsSet)
    }
  }
}

function convert(value) {
  return isObject(value) ? reactive(value) : value
}

export function ref(value) {
  return new RefImpl(value)
}

export function isRef(ref) {
  return !!ref.__v_isRef
}

export function unRef(ref) {
  return isRef(ref) ? ref.value : ref
}

export function proxyRefs(objectWithRefs) {
  return new Proxy(objectWithRefs, {
    get(target, key, receiver) {
      return unRef(Reflect.get(target, key, receiver))
    },
    set(target, key, newValue, receiver) {
      if (isRef(target[key]) && !isRef(newValue)) {
        return (target[key].value = newValue)
      } else {
        return Reflect.set(target, key, newValue, receiver)
      }
    },
  })
}
