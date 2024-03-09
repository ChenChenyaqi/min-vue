import { generate } from "../src/codegen"
import { baseParse } from "../src/parse"
import { transform } from "../src/transform"
import { transformElement } from "../src/transforms/transformElement"
import { transformExpression } from "../src/transforms/transformExpression"
import { transformText } from "../src/transforms/transformText"

describe("codegen", () => {
  it("string", () => {
    const ast = baseParse("hi")
    transform(ast as any)
    const { code } = generate(ast)
    // 快照测试
    expect(code).toMatchSnapshot()
  })

  it("interpolation", () => {
    const ast = baseParse("{{message}}")
    transform(ast as any, {
      nodeTransforms: [transformExpression as any],
    })
    const { code } = generate(ast)
    // 快照测试
    expect(code).toMatchSnapshot()
  })

  it("element", () => {
    const ast = baseParse("<div>hi, {{message}}</div>")
    transform(ast as any, {
      nodeTransforms: [
        transformExpression,
        transformElement as any,
        transformText,
      ],
    })

    const { code } = generate(ast)
    // 快照测试
    expect(code).toMatchSnapshot()
  })
})
