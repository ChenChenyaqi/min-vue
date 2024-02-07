import { camelize, toHandlerKey } from "../shared"
import { ComponentInstance } from "./component"

export function emit(instance: ComponentInstance, event: string, ...args) {
  console.log("emit: ", event)

  const { props } = instance

  const handlerName = toHandlerKey(camelize(event))
  const handler = props[handlerName]
  handler && handler(...args)
}