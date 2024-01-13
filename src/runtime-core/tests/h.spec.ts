import { h } from ".."

describe("h", () => {
  it("only type", () => {
    const vnode = h("div")
    expect(vnode).toMatchObject({
      type: "div",
      props: {},
      children: [],
    })
  })

  it("type and props", () => {
    const vnode = h("div", { id: "root", className: "father" })
    expect(vnode).toMatchObject({
      type: "div",
      props: {
        id: "root",
        className: "father",
      },
      children: [],
    })
  })

  it("type and children is string", () => {
    const vnode = h("div", "我是一个div")
    expect(vnode).toMatchObject({
      type: "div",
      props: {},
      children: "我是一个div",
    })
  })

  it("type and children is array", () => {
    const vnode = h("div", [
      "我是一个div",
      { type: "p", children: "p-content" },
    ])
    expect(vnode).toMatchObject({
      type: "div",
      props: {},
      children: ["我是一个div", { type: "p", children: "p-content" }],
    })
  })

  it("type and props and children", () => {
    const vnode = h("div", { id: "root", className: "father" }, "我是一个div")
    expect(vnode).toMatchObject({
      type: "div",
      props: { id: "root", className: "father" },
      children: "我是一个div",
    })
  })
})
