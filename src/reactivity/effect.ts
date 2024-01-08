import { extend } from "../shared"

const effectStack: ReactiveEffect[] = []
export class ReactiveEffect {
  private _fn: any
  // 是否没有stop过
  private active: boolean = true
  deps: Set<ReactiveEffect>[] = []
  onStop: Function | undefined

  constructor(fn: Function, public scheduler?: Function) {
    this._fn = fn
    this.scheduler = scheduler
  }

  run() {
    activeEffect = this
    cleanupEffect(this)
    effectStack.push(this)
    const res = this._fn()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }
  stop() {
    if (this.active) {
      cleanupEffect(this)
      if (this.onStop) {
        this.onStop()
      }
      this.active = false
    }
  }
}

function cleanupEffect(effect: ReactiveEffect) {
  effect.deps.forEach((dep: Set<ReactiveEffect>) => {
    dep.delete(effect)
  })
  effect.deps.length = 0
}

// 当前的副作用函数
let activeEffect: null | ReactiveEffect = null
// 收集effect函数
const bucket = new WeakMap()
export function track(target, key) {
  if (!activeEffect) {
    return
  }
  let depsMap = bucket.get(target)
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()))
  }
  let depsSet = depsMap.get(key)
  if (!depsSet) {
    depsMap.set(key, (depsSet = new Set()))
  }
  trackEffect(depsSet)
}

export function trackEffect(depsSet) {
  if (!activeEffect) {
    return
  }
  if (depsSet.has(activeEffect)) {
    return
  }
  depsSet.add(activeEffect)
  // 反向收集，用于实现stop
  activeEffect.deps.push(depsSet)
}

export function trigger(target, key) {
  const depsMap = bucket.get(target)
  if (!depsMap) {
    return
  }
  const depsSet = depsMap.get(key)
  triggerEffect(depsSet)
}

export function triggerEffect(depsSet: any) {
  const effectToRun = new Set<ReactiveEffect>()
  depsSet &&
    depsSet.forEach((effect: ReactiveEffect) => {
      if (activeEffect !== effect) {
        effectToRun.add(effect)
      }
    })
  effectToRun.forEach((effect) => {
    if (effect.scheduler) {
      effect.scheduler()
    } else {
      effect.run()
    }
  })
}

type Options = {
  scheduler?: Function
  onStop?: Function
}

export function effect(fn: Function, options: Options = {}) {
  const _effect = new ReactiveEffect(fn, options.scheduler)
  extend(_effect, options)

  _effect.run()
  const runner = _effect.run.bind(_effect)
  ;(runner as any).effect = _effect
  return runner
}

export function stop(runner: Function) {
  ;(runner as any).effect.stop()
}
