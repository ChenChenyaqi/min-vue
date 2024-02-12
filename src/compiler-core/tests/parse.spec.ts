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
})
