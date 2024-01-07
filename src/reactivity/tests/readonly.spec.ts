import { readonly } from "../reactive"

describe("readonly", () => {
  it("readonly只读不可写", () => {
    console.warn = jest.fn()

    const origin = { foo: 1, bar: { baz: 2 } }
    const wrapped = readonly(origin)
    expect(wrapped).not.toBe(origin)
    expect(wrapped.foo).toBe(1)

    // readonly 不可写
    wrapped.foo = 2
    expect(console.warn).toHaveBeenCalled()
  })
})
