import { createRenderer } from "@min-vue/runtime-core"
export * from "@min-vue/runtime-core"

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

function insert(el: Element, parent: Element, anchor: Element | null = null) {
  parent.insertBefore(el, anchor)
}

function createTextNode(content: string) {
  return document.createTextNode(content)
}

function remove(child: Element) {
  const parent = child.parentNode
  if (parent) {
    parent.removeChild(child)
  }
}

function setElementText(el: Element, text: string) {
  el.textContent = text
}

const renderer: any = createRenderer({
  createElement,
  patchProp,
  insert,
  createTextNode,
  remove,
  setElementText,
})

export function createApp(...args) {
  return renderer.createApp(...args)
}
