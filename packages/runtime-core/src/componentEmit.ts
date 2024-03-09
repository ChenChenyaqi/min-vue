import { camelize, toHandlerKey } from "@min-vue/shared"
import { ComponentInstance } from "./component"

export function emit(instance: ComponentInstance, event: string, ...args) {
  const { props } = instance

  const handlerName = toHandlerKey(camelize(event))
  const handler = props[handlerName]
  handler && handler(...args)
}
