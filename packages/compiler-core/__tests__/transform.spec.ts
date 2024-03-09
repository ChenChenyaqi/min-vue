import { transform } from "../src/transform"
import { baseParse } from "../src/parse"
import { NodeTypes, Text } from "../src/ast"

describe("transform", () => {
  it("happy path", () => {
    const ast = baseParse("<div>hi,{{message}}</div>")

    const plugin = (node: Text) => {
      if (node.type === NodeTypes.TEXT) {
        node.content = node.content + "min-vue"
      }
    }
    transform(ast as any, {
      nodeTransforms: [plugin as any],
    })
    const nodeText = ast.children[0].children[0]
    expect(nodeText.content).toBe("hi,min-vue")
  })
})
