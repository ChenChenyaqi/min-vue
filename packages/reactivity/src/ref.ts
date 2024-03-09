import { hasChanged, isArray, isObject } from "@min-vue/shared"
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

export function toRef<T>(value: T)
export function toRef<T extends object, K extends keyof T>(
  source: T,
  key?: K,
  defaultValue?: unknown
)
export function toRef<T extends object, K extends keyof T>(
  source: T,
  key?: K,
  defaultValue?: unknown
) {
  if (isRef(source)) {
    return source
  } else if (isObject(source) && arguments.length > 1) {
    return propertyToRef(source, key!, defaultValue)
  } else {
    return ref(source)
  }
}

function propertyToRef(
  source: Record<string, any>,
  key: any,
  defaultValue?: unknown
) {
  const val = source[key]
  return isRef(val) ? val : new ObjectRefImpl(source, key, defaultValue)
}

class ObjectRefImpl<T extends object, K extends keyof T> {
  public readonly __v_isRef = true

  constructor(
    private readonly _object: T,
    private readonly _key: K,
    private readonly _defaultValue?: T[K]
  ) {}

  get value() {
    const val = this._object[this._key]
    return val === undefined ? this._defaultValue! : val
  }

  set value(newVal) {
    this._object[this._key] = newVal
  }
}

export function toRefs<T extends object>(object: T) {
  const ret: any = isArray(object) ? new Array((object as any[]).length) : {}
  for (const key in object) {
    ret[key] = propertyToRef(object, key)
  }
  return ret
}
