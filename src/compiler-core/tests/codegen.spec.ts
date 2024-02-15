import { generate } from "../codegen"
import { baseParse } from "../parse"
import { transform } from "../transform"
import { transformExpression } from "../transforms/transformExpression"

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
})
