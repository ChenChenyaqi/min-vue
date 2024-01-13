import { PublicInstanceProxyHandlers } from "./componentPublicInstance"
import { Component } from "./h"
import { VNode } from "./vnode"

export interface ComponentInstance {
  vnode: VNode
  type: VNode["type"]
  setupState?: object
  render?: Component["render"]
  proxy?: any
}

export function createComponentInstance(vnode: VNode): ComponentInstance {
  const component: ComponentInstance = {
    vnode,
    type: vnode.type,
    setupState: {},
  }

  return component
}

export function setupComponent(instance: ComponentInstance) {
  // initProps()
  // initSlots()

  setupStatefulComponent(instance)
}

function setupStatefulComponent(instance: ComponentInstance) {
  const Component = instance.type as Component

  instance.proxy = new Proxy({ _: instance }, PublicInstanceProxyHandlers)

  const { setup } = Component

  if (setup) {
    // setup可以返回一个对象或者渲染函数
    const setupResult = setup()

    handleSetupResult(instance, setupResult)
  }
}

function handleSetupResult(instance: ComponentInstance, setupResult: object) {
  // TODO function

  if (typeof setupResult === "object") {
    instance.setupState = setupResult
  }

  finishComponentSetup(instance)
}

function finishComponentSetup(instance: ComponentInstance) {
  const Component = instance.type as Component
  instance.render = Component.render
}
