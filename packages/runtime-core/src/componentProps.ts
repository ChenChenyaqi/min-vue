import { ComponentInstance } from "./component"

export function initProps(instance: ComponentInstance, rawProps: object) {
  instance.props = rawProps
}
