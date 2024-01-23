import { createRenderer } from "../runtime-core"

function createElement(type: string) {
  return document.createElement(type)
}

function patchProp(el: Element, key: string, value) {
  const isOn = (key: string) => /^on[A-Z]/.test(key)
  if (isOn(key)) {
    const event = key.slice(2).toLowerCase()
    el.addEventListener(event, value)
  } else {
    el.setAttribute(key, value)
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
