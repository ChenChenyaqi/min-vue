import { hasOwn } from "@min-vue/shared"

const publicPropertiesMap = {
  $el: (i) => i.vnode.el,
  $slots: (i) => i.slots,
  $props: (i) => i.props,
}

export const PublicInstanceProxyHandlers = {
  get({ _: instance }, key) {
    const { setupState, props } = instance

    if (hasOwn(setupState, key)) {
      return setupState![key]
    } else if (hasOwn(props, key)) {
      return props[key]
    }

    const publicGetter = publicPropertiesMap[key]
    return publicGetter && publicGetter(instance)
  },
}
