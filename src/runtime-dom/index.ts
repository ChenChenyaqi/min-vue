import { createRenderer } from "../runtime-core"

function createElement(type: string) {
  return document.createElement(type)
}

function patchProp(el: Element, key: string, oldValue, newValue) {
  const isOn = (key: string) => /^on[A-Z]/.test(key)
  if (isOn(key)) {
    const event = key.slice(2).toLowerCase()
    el.addEventListener(event, newValue)
    el.removeEventListener(event, oldValue)
  } else {
    if (newValue === undefined || newValue === null) {
      el.removeAttribute(key)
    } else {
      el.setAttribute(key, newValue)
    }
  }
}

function insert(el: Element, container: Element) {
  container.appendChild(el)
}

function createTextNode(content: string) {
  return document.createTextNode(content)
}

const renderer: any = createRenderer({
  createElement,
  patchProp,
  insert,
  createTextNode,
})

export function createApp(...args) {
  return renderer.createApp(...args)
}

export * from "../runtime-core"
