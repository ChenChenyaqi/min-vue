import { proxyRefs } from "../reactivity"
import { shallowReadonly } from "../reactivity/reactive"
import { emit } from "./componentEmit"
import { initProps } from "./componentProps"
import { PublicInstanceProxyHandlers } from "./componentPublicInstance"
import { initSlots } from "./componentSlots"
import { Component } from "./h"
import { VNode } from "./vnode"

export interface ComponentInstance {
  vnode: VNode
  type: VNode["type"]
  props: object
  emit: Function
  slots: object
  provides?: object
  parent?: ComponentInstance
  setupState?: object
  render?: Component["render"]
  proxy?: any
  isMounted: boolean
  subTree: VNode | null
}

export function createComponentInstance(
  vnode: VNode,
  parent?: ComponentInstance
): ComponentInstance {
  const component: ComponentInstance = {
    vnode,
    props: {},
    emit: (): void => {},
    slots: {},
    provides: parent ? parent.provides : {},
    parent,
    type: vnode.type,
    setupState: {},
    isMounted: false,
    subTree: null,
  }

  component.emit = emit.bind(null, component)

  return component
}

export function setupComponent(instance: ComponentInstance) {
  initProps(instance, instance.vnode.props)
  initSlots(instance, instance.vnode.children as any)

  setupStatefulComponent(instance)
}

function setupStatefulComponent(instance: ComponentInstance) {
  const Component = instance.type as Component

  instance.proxy = new Proxy({ _: instance }, PublicInstanceProxyHandlers)

  const { setup } = Component

  if (setup) {
    setCurrentInstance(instance)
    // setup可以返回一个对象或者渲染函数
    const setupResult = proxyRefs(
      setup(shallowReadonly(instance.props), {
        emit: instance.emit,
      })
    )
    setCurrentInstance(null)

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

let currentInstance: null | ComponentInstance = null

export function getCurrentInstance() {
  return currentInstance
}

function setCurrentInstance(instance: ComponentInstance | null) {
  currentInstance = instance
}
