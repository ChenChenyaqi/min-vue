// min-vue出口
export * from "@min-vue/runtime-dom"

import { baseCompile } from "@min-vue/compiler-core"
import * as runtimeDom from "@min-vue/runtime-dom"
import { registerRuntimeCompiler } from "@min-vue/runtime-dom"

function compileToFunction(template) {
  const { code } = baseCompile(template)

  const render = new Function("Vue", code)(runtimeDom)

  return render
}

registerRuntimeCompiler(compileToFunction)
