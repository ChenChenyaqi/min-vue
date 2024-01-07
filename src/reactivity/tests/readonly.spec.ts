import { readonly, isReadonly } from "../reactive"

describe("readonly", () => {
  it("readonly只读不可写", () => {
    console.warn = jest.fn()
    const original = { foo: 1, bar: { baz: 2 } }
    const wrapped = readonly(original)
    expect(wrapped).not.toBe(original)
    expect(wrapped.foo).toBe(1)

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
})
