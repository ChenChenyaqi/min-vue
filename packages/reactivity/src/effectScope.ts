import { ReactiveEffect } from "./effect"

let activeEffectScope
export class EffectScope {
  private _active = true
  public effects: ReactiveEffect[] = []

  constructor() {}

  run<T>(fn: () => T): T | undefined {
    activeEffectScope = this
    return fn()
  }

  get active() {
    return this._active
  }

  stop() {
    if (this._active) {
      this._active = false
      this.effects.forEach((eff) => eff.stop())
    }
  }
}

export function recordEffectScope(effect: ReactiveEffect) {
  if (activeEffectScope && activeEffectScope.active) {
    activeEffectScope.effects.push(effect)
  }
}
