import { NodeTypes } from "../ast"
import { baseParse } from "../parse"

describe("Parse", () => {
  describe("interpolation", () => {
    it("simple interpolation", () => {
      const ast = baseParse("{{ message }}") as any

      expect(ast.children[0]).toStrictEqual({
        type: NodeTypes.INTERPOLATION,
        content: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: "message",
        },
      })
    })
  })

  describe("element", () => {
    it("simple element div", () => {
      const ast = baseParse("<div></div>")

      expect(ast.children[0]).toStrictEqual({
        type: NodeTypes.ELEMENT,
        tag: "div",
        children: [],
      })
    })
  })

  describe("text", () => {
    it("simple text", () => {
      const ast = baseParse("我是div")

      expect(ast.children[0]).toStrictEqual({
        type: NodeTypes.TEXT,
        content: "我是div",
      })
    })
  })

  test("hello world", () => {
    const ast = baseParse("<div>hi, {{ message }}</div>")

    expect(ast.children[0]).toStrictEqual({
      type: NodeTypes.ELEMENT,
      tag: "div",
      children: [
        {
          type: NodeTypes.TEXT,
          content: "hi, ",
        },
        {
          type: NodeTypes.INTERPOLATION,
          content: {
            type: NodeTypes.SIMPLE_EXPRESSION,
            content: "message",
          },
        },
      ],
    })
  })

  test("Nested element", () => {
    const ast = baseParse("<div><p>hi</p>hi, {{ message }}</div>")

    expect(ast.children[0]).toStrictEqual({
      type: NodeTypes.ELEMENT,
      tag: "div",
      children: [
        {
          type: NodeTypes.ELEMENT,
          tag: "p",
          children: [
            {
              type: NodeTypes.TEXT,
              content: "hi",
            },
          ],
        },
        {
          type: NodeTypes.TEXT,
          content: "hi, ",
        },
        {
          type: NodeTypes.INTERPOLATION,
          content: {
            type: NodeTypes.SIMPLE_EXPRESSION,
            content: "message",
          },
        },
      ],
    })
  })

  test("should throw error when lack end tag", () => {
    expect(() => {
      baseParse("<div><span></div>")
    }).toThrow("不存在结束标签 </span>")
  })
})
