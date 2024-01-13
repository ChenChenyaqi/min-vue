export function createComponentInstance(vnode) {
  const component = {
    vnode,
    type: vnode.type,
  }

  return component
}

export function setupComponent(instance) {
  // initProps()
  // initSlots()

  setupStatefulComponent(instance)
}

function setupStatefulComponent(instance) {
  const Component = instance.type

  const { setup } = Component

  if (setup) {
    // setup可以返回一个对象或者渲染函数
    const setupResult = setup()

    handleSetupResult(instance, setupResult)
  }
}

function handleSetupResult(instance, setupResult) {
  // TODO function

  if (typeof setupResult === "object") {
    instance.setupState = setupResult
  }

  finishComponentSetup(instance)
}

function finishComponentSetup(instance) {
  const Component = instance.type
  instance.render = Component.render
}