import { reactive, isReactive, isProxy } from "../reactive"

describe("reactive", () => {
  it("happy path", () => {
    const original = { foo: 1 }
    const observed = reactive(original)

    expect(observed).not.toBe(original)
    expect(observed.foo).toBe(1)
    expect(isProxy(observed)).toBe(true)
  })

  it("isReactive", () => {
    const original = { foo: 1 }
    const observed = reactive(original)

    expect(isReactive(observed)).toBe(true)
    expect(isReactive(original)).toBe(false)
  })

  it("嵌套reactive", () => {
    const original = {
      foo: 1,
      bar: {
        baz: 1,
      },
      array: [{ bar: 2 }],
    }
    const observed = reactive(original)

    expect(isReactive(observed)).toBe(true)
    expect(isReactive(observed.bar)).toBe(true)
    expect(isReactive(observed.array)).toBe(true)
    expect(isReactive(observed.array[0])).toBe(true)
    expect(isReactive(original.bar)).toBe(false)
  })
})
