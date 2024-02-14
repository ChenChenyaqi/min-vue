import { generate } from "../codegen"
import { baseParse } from "../parse"

describe("codegen", () => {
  it("string", () => {
    const ast = baseParse("hi")
    const { code } = generate(ast)
    // 快照测试
    expect(code).toMatchSnapshot()
  })
})
