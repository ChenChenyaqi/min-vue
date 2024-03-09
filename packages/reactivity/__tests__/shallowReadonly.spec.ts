import { vi } from "vitest"
import { isReadonly, shallowReadonly } from "../src/reactive"

describe("shallowReadonly", () => {
  it("happy path", () => {
    const original = {
      foo: 1,
      bar: {
        baz: 2,
      },
    }
    const observed = shallowReadonly(original)
    expect(isReadonly(observed)).toBe(true)
    expect(isReadonly(observed.foo)).toBe(false)
    expect(isReadonly(observed.bar)).toBe(false)
  })

  it("shallowReadonly只读不可写", () => {
    console.warn = vi.fn()
    const original = { foo: 1, bar: { baz: 2 } }
    const wrapped = shallowReadonly(original)
    expect(wrapped).not.toBe(original)
    expect(wrapped.foo).toBe(1)

    // readonly 不可写
    wrapped.foo = 2
    expect(console.warn).toHaveBeenCalled()
  })
})
