import { readonly, isReadonly, isProxy } from "../src/reactive"

describe("readonly", () => {
  it("readonly只读不可写", () => {
    console.warn = jest.fn()
    const original = { foo: 1, bar: { baz: 2 } }
    const wrapped = readonly(original)
    expect(wrapped).not.toBe(original)
    expect(wrapped.foo).toBe(1)
    expect(isProxy(wrapped)).toBe(true)

    // readonly 不可写
    wrapped.foo = 2
    expect(console.warn).toHaveBeenCalled()
  })

  it("isReadonly", () => {
    const original = { foo: 1, bar: { baz: 2 } }
    const wrapped = readonly(original)

    expect(isReadonly(wrapped)).toBe(true)
    expect(isReadonly(original)).toBe(false)
  })

  it("嵌套reactive", () => {
    const original = {
      foo: 1,
      bar: {
        baz: 1,
      },
      array: [{ bar: 2 }],
    }
    const observed = readonly(original)

    expect(isReadonly(observed)).toBe(true)
    expect(isReadonly(observed.bar)).toBe(true)
    expect(isReadonly(observed.array)).toBe(true)
    expect(isReadonly(observed.array[0])).toBe(true)
    expect(isReadonly(original.bar)).toBe(false)
  })
})
