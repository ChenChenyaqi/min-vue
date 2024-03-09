'use strict';

function toDisplayString(val) {
    return String(val);
}

function extend(origin, ...target) {
    return Object.assign(origin, ...target);
}
function isObject(value) {
    return value !== null && typeof value === "object";
}
function isString(value) {
    return typeof value === "string";
}
function isArray(value) {
    return Array.isArray(value);
}
function hasChanged(value, newValue) {
    return !Object.is(value, newValue);
}
function convertStringToHTMLElement(rootContainer) {
    let rootElement = rootContainer;
    if (typeof rootContainer === "string") {
        rootElement = document.querySelector(rootContainer);
    }
    return rootElement;
}
function hasOwn(val, key) {
    return Object.prototype.hasOwnProperty.call(val, key);
}
function camelize(str) {
    return str.replace(/-(\w)/g, (_, c) => {
        return c ? c.toUpperCase() : "";
    });
}
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
function toHandlerKey(str) {
    return str ? "on" + capitalize(str) : "";
}

// 当前的副作用函数
let activeEffect = null;
// 收集effect函数
const bucket = new WeakMap();
class ReactiveEffect {
    constructor(fn, scheduler) {
        this.scheduler = scheduler;
        // 是否没有stop过
        this.active = true;
        this.deps = [];
        this._fn = fn;
        this.scheduler = scheduler;
    }
    run() {
        if (!this.active) {
            return this._fn();
        }
        activeEffect = this;
        const res = this._fn();
        activeEffect = null;
        return res;
    }
    stop() {
        if (this.active) {
            cleanupEffect(this);
            if (this.onStop) {
                this.onStop();
            }
            this.active = false;
        }
    }
}
function cleanupEffect(effect) {
    effect.deps.forEach((dep) => {
        dep.delete(effect);
    });
    effect.deps.length = 0;
}
function track(target, key) {
    if (!activeEffect) {
        return;
    }
    let depsMap = bucket.get(target);
    if (!depsMap) {
        bucket.set(target, (depsMap = new Map()));
    }
    let depsSet = depsMap.get(key);
    if (!depsSet) {
        depsMap.set(key, (depsSet = new Set()));
    }
    trackEffect(depsSet);
}
function trackEffect(depsSet) {
    if (!activeEffect) {
        return;
    }
    if (depsSet.has(activeEffect)) {
        return;
    }
    depsSet.add(activeEffect);
    // 反向收集，用于实现stop
    activeEffect.deps.push(depsSet);
}
function trigger(target, key) {
    const depsMap = bucket.get(target);
    if (!depsMap) {
        return;
    }
    const depsSet = depsMap.get(key);
    triggerEffect(depsSet);
}
function triggerEffect(depsSet) {
    const effectToRun = new Set();
    depsSet &&
        depsSet.forEach((effect) => {
            if (activeEffect !== effect) {
                effectToRun.add(effect);
            }
        });
    effectToRun.forEach((effect) => {
        if (effect.scheduler) {
            effect.scheduler();
        }
        else {
            effect.run();
        }
    });
}
function effect(fn, options = {}) {
    const _effect = new ReactiveEffect(fn, options.scheduler);
    extend(_effect, options);
    _effect.run();
    const runner = _effect.run.bind(_effect);
    runner.effect = _effect;
    return runner;
}

const get = createGetter();
const set = createSetter();
const readonlyGet = createGetter(true);
const shallowReadonlyGet = createGetter(true, true);
function createGetter(isReadonly = false, shallow = false) {
    return function get(target, key, receiver) {
        if (key === "__v_isReactive" /* ReactiveFlags.IS_REACTIVE */) {
            return !isReadonly;
        }
        else if (key === "__v_isReadonly" /* ReactiveFlags.IS_READONLY */) {
            return isReadonly;
        }
        const res = Reflect.get(target, key, receiver);
        if (shallow) {
            return res;
        }
        if (!isReadonly) {
            track(target, key);
        }
        if (isObject(res)) {
            return isReadonly ? readonly(res) : reactive(res);
        }
        return res;
    };
}
function createSetter() {
    return function set(target, key, newValue, receiver) {
        const res = Reflect.set(target, key, newValue, receiver);
        // 触发依赖
        trigger(target, key);
        return res;
    };
}
const mutableHandlers = {
    get,
    set,
};
const readonlyHandlers = {
    get: readonlyGet,
    set(target, key, newValue) {
        console.warn(`readonly 不能修改: 设置 ${target} 中的 ${key}时`);
        return true;
    },
};
const shallowReadonlyHandlers = extend({}, readonlyHandlers, {
    get: shallowReadonlyGet,
});

function reactive(raw) {
    return createActiveObject(raw, mutableHandlers);
}
function readonly(raw) {
    return createActiveObject(raw, readonlyHandlers);
}
function shallowReadonly(raw) {
    return createActiveObject(raw, shallowReadonlyHandlers);
}
function createActiveObject(target, baseHandlers) {
    if (!isObject(target)) {
        console.warn(`target ${target} 必须是一个对象`);
    }
    return new Proxy(target, baseHandlers);
}

class RefImpl {
    constructor(value) {
        this.__v_isRef = true;
        this._value = convert(value);
        this._rowValue = value;
        this.depsSet = new Set();
    }
    get value() {
        trackEffect(this.depsSet);
        return this._value;
    }
    set value(newValue) {
        if (hasChanged(this._rowValue, newValue)) {
            this._value = convert(newValue);
            this._rowValue = newValue;
            triggerEffect(this.depsSet);
        }
    }
}
function convert(value) {
    return isObject(value) ? reactive(value) : value;
}
function ref(value) {
    return new RefImpl(value);
}
function isRef(ref) {
    return !!ref.__v_isRef;
}
function unRef(ref) {
    return isRef(ref) ? ref.value : ref;
}
function proxyRefs(objectWithRefs) {
    return new Proxy(objectWithRefs, {
        get(target, key, receiver) {
            return unRef(Reflect.get(target, key, receiver));
        },
        set(target, key, newValue, receiver) {
            if (isRef(target[key]) && !isRef(newValue)) {
                return (target[key].value = newValue);
            }
            else {
                return Reflect.set(target, key, newValue, receiver);
            }
        },
    });
}

class ComputedRefImpl {
    constructor(getter) {
        this._dirty = true;
        this._effect = new ReactiveEffect(getter, () => {
            if (!this._dirty) {
                this._dirty = true;
            }
        });
    }
    get value() {
        if (this._dirty) {
            this._dirty = false;
            this._value = this._effect.run();
        }
        return this._value;
    }
}
function computed(getter) {
    return new ComputedRefImpl(getter);
}

function emit(instance, event, ...args) {
    const { props } = instance;
    const handlerName = toHandlerKey(camelize(event));
    const handler = props[handlerName];
    handler && handler(...args);
}

function initProps(instance, rawProps) {
    instance.props = rawProps;
}

const publicPropertiesMap = {
    $el: (i) => i.vnode.el,
    $slots: (i) => i.slots,
    $props: (i) => i.props,
};
const PublicInstanceProxyHandlers = {
    get({ _: instance }, key) {
        const { setupState, props } = instance;
        if (hasOwn(setupState, key)) {
            return setupState[key];
        }
        else if (hasOwn(props, key)) {
            return props[key];
        }
        const publicGetter = publicPropertiesMap[key];
        return publicGetter && publicGetter(instance);
    },
};

function initSlots(instance, children) {
    // array or object
    // instance.slots = Array.isArray(children) ? children : [children]
    const slots = {};
    for (const key in children) {
        const value = children[key];
        slots[key] = Array.isArray(value)
            ? value
            : typeof value === "function"
                ? value
                : [value];
    }
    instance.slots = slots;
}

function createComponentInstance(vnode, parent) {
    const component = {
        vnode,
        props: {},
        emit: () => { },
        slots: {},
        provides: parent ? parent.provides : {},
        parent,
        type: vnode.type,
        setupState: {},
        isMounted: false,
        subTree: null,
    };
    component.emit = emit.bind(null, component);
    return component;
}
function setupComponent(instance) {
    initProps(instance, instance.vnode.props);
    initSlots(instance, instance.vnode.children);
    setupStatefulComponent(instance);
}
function setupStatefulComponent(instance) {
    const Component = instance.type;
    instance.proxy = new Proxy({ _: instance }, PublicInstanceProxyHandlers);
    const { setup } = Component;
    if (setup) {
        setCurrentInstance(instance);
        // setup可以返回一个对象或者渲染函数
        const setupResult = proxyRefs(setup(shallowReadonly(instance.props), {
            emit: instance.emit,
        }));
        setCurrentInstance(null);
        handleSetupResult(instance, setupResult);
    }
}
function handleSetupResult(instance, setupResult) {
    if (typeof setupResult === "object") {
        instance.setupState = setupResult;
    }
    finishComponentSetup(instance);
}
function finishComponentSetup(instance) {
    const Component = instance.type;
    if (compiler && !Component.render) {
        if (Component.template) {
            Component.render = compiler(Component.template);
        }
    }
    instance.render = Component.render;
}
let currentInstance = null;
function getCurrentInstance() {
    return currentInstance;
}
function setCurrentInstance(instance) {
    currentInstance = instance;
}
let compiler;
function registerRuntimeCompiler(_compiler) {
    compiler = _compiler;
}

function shouldUpdateComponent(newVNode, oldVNode) {
    const { props: oldProps } = oldVNode || {};
    const { props: newProps } = newVNode;
    for (const key in newProps) {
        if (newProps[key] !== (oldProps === null || oldProps === void 0 ? void 0 : oldProps[key])) {
            return true;
        }
    }
    return false;
}

const Text = Symbol("Text");
function createVNode(type, props, children) {
    const vnode = {
        type,
        props: props || {},
        children: children || [],
        component: null,
        el: null,
        key: props === null || props === void 0 ? void 0 : props.key,
    };
    return vnode;
}
function createTextVNode(content) {
    return createVNode(Text, {}, content);
}

function createAppAPI(render) {
    return function createApp(rootComponent) {
        return {
            mount(_rootContainer) {
                const vnode = createVNode(rootComponent);
                const rootContainer = convertStringToHTMLElement(_rootContainer);
                render(vnode, rootContainer);
            },
        };
    };
}

const queue = [];
const p = Promise.resolve();
let isFlushPending = false;
function nextTick(fn) {
    return fn ? p.then(fn) : p;
}
function queueJobs(job) {
    if (!queue.includes(job)) {
        queue.push(job);
    }
    queueFlush();
}
function queueFlush() {
    if (isFlushPending)
        return;
    isFlushPending = true;
    nextTick(flushJobs);
}
function flushJobs() {
    let job;
    isFlushPending = false;
    while ((job = queue.shift())) {
        job && job();
    }
}

const Fragment = Symbol("Fragment");
function createRenderer(options) {
    const { createElement: hostCreateElement, patchProp: hostPatchProp, insert: hostInsert, createTextNode: hostCreateTextNode, remove: hostRemove, setElementText: hostSetElementText, } = options;
    function render(vnode, container) {
        patch(vnode, null, container, undefined, null);
    }
    function patch(newVNode, preVNode, container, parentComponent, anchor) {
        switch (newVNode.type) {
            case Fragment:
                processFragment(newVNode, preVNode, container, parentComponent);
                break;
            case Text:
                processText(newVNode, preVNode, container, anchor);
                break;
            default:
                if (typeof newVNode.type === "string") {
                    // 处理组件
                    processElement(newVNode, preVNode, container, parentComponent, anchor);
                }
                else if (isObject(newVNode.type)) {
                    processComponent(newVNode, preVNode, container, parentComponent);
                }
                break;
        }
    }
    function processText(newVNode, preVNode, container, anchor) {
        const { children } = newVNode;
        const textNode = (newVNode.el = hostCreateTextNode(children));
        hostInsert(textNode, container, anchor);
    }
    function processFragment(newVNode, preVNode, container, parentComponent, anchor) {
        if (typeof newVNode.children === "string")
            return;
        newVNode.children.forEach((child) => patch(child, null, container, parentComponent, anchor));
    }
    function processElement(newVNode, preVNode, container, parentComponent, anchor) {
        if (!preVNode) {
            mountElement(newVNode, container, parentComponent, anchor);
        }
        else {
            patchElement(newVNode, preVNode, parentComponent, anchor);
        }
    }
    function patchElement(newVNode, preVNode, parentComponent, anchor) {
        const oldProps = preVNode.props || EMPTY_OBJ;
        const newProps = newVNode.props || EMPTY_OBJ;
        const el = (newVNode.el = preVNode.el);
        patchChildren(preVNode, newVNode, el, parentComponent, anchor);
        patchProps(el, oldProps, newProps);
    }
    function patchChildren(preVNode, newVNode, el, parentComponent, anchor) {
        const newChildren = newVNode.children;
        const preChildren = preVNode.children;
        // 新children是文本
        if (isString(newChildren)) {
            if (isArray(preChildren)) {
                // 把老children清空
                unmountChildren(preChildren);
            }
            if (newChildren !== preChildren) {
                // 更新text
                hostSetElementText(el, newChildren);
            }
        }
        else if (isArray(newChildren)) {
            if (isString(preChildren)) {
                hostSetElementText(el, "");
                mountChildren(newChildren, el, parentComponent, anchor);
            }
            else if (isArray(preChildren)) {
                // diff array
                patchKeyedChildren(newChildren, preChildren, el, parentComponent, anchor);
            }
        }
    }
    function isSameKeyNode(n1, n2) {
        return n1.key === n2.key && n1.type === n2.type;
    }
    function patchKeyedChildren(newChildren, preChildren, el, parentComponent, parentAnchor) {
        var _a;
        // 四个索引值
        let preStartIndex = 0;
        let preEndIndex = preChildren.length - 1;
        let newStartIndex = 0;
        let newEndIndex = newChildren.length - 1;
        // 四个索引指向的vnode节点
        let preStartVNode = preChildren[preStartIndex];
        let preEndVNode = preChildren[preEndIndex];
        let newStartVNode = newChildren[newStartIndex];
        let newEndVNode = newChildren[newEndIndex];
        while (preStartIndex <= preEndIndex && newStartIndex <= newEndIndex) {
            if (!preStartVNode) {
                preStartVNode = preChildren[++preStartIndex];
            }
            else if (!preEndVNode) {
                preEndVNode = preChildren[--preEndIndex];
            }
            else if (isSameKeyNode(preStartVNode, newStartVNode)) {
                patch(newStartVNode, preStartVNode, el, parentComponent, parentAnchor);
                preStartVNode = preChildren[++preStartIndex];
                newStartVNode = newChildren[++newStartIndex];
            }
            else if (isSameKeyNode(preEndVNode, newEndVNode)) {
                patch(newEndVNode, preEndVNode, el, parentComponent, parentAnchor);
                preEndVNode = preChildren[--preEndIndex];
                newEndVNode = newChildren[--newEndIndex];
            }
            else if (preStartVNode.key === newEndVNode.key) {
                patch(newEndVNode, preStartVNode, el, parentComponent, parentAnchor);
                hostInsert(preStartVNode.el, el, (_a = preEndVNode.el) === null || _a === void 0 ? void 0 : _a.nextSibling);
                preStartVNode = preChildren[++preStartIndex];
                newEndVNode = newChildren[--newEndIndex];
            }
            else if (preEndVNode.key === newStartVNode.key) {
                patch(newStartVNode, preEndVNode, el, parentComponent, parentAnchor);
                hostInsert(preEndVNode.el, el, preStartVNode.el);
                preEndVNode = preChildren[--preEndIndex];
                newStartVNode = newChildren[++newStartIndex];
            }
            else {
                // 处理非理性的情况
                const indexInPre = preChildren.findIndex((node) => node.key === newStartVNode.key);
                if (indexInPre > 0) {
                    // 能在preChildren中找到newStarVNode，说明可以复用，移动旧节点
                    const vnodeToMove = preChildren[indexInPre];
                    patch(newStartVNode, vnodeToMove, el, parentComponent, parentAnchor);
                    hostInsert(vnodeToMove.el, el, preStartVNode.el);
                    preChildren[indexInPre] = undefined;
                }
                else {
                    // 找不到，说明是新的节点，进行挂载
                    patch(newStartVNode, null, el, parentComponent, preStartVNode.el);
                }
                newStartVNode = newChildren[++newStartIndex];
            }
        }
        // 检查是否还有遗留的节点
        if (preEndIndex < preStartIndex && newStartIndex <= newEndIndex) {
            // 有新增的节点要处理
            for (let i = newStartIndex; i <= newEndIndex; i++) {
                patch(newChildren[i], null, el, parentComponent, preStartVNode.el);
            }
        }
        else if (newEndIndex < newStartIndex && preStartIndex <= preEndIndex) {
            // 有卸载的节点要处理
            const childWillUnmountList = [];
            for (let i = preStartIndex; i <= preEndIndex; i++) {
                childWillUnmountList.push(preChildren[i]);
            }
            unmountChildren(childWillUnmountList);
        }
    }
    function unmountChildren(children) {
        for (let i = 0; i < children.length; i++) {
            const el = children[i].el;
            hostRemove(el);
        }
    }
    const EMPTY_OBJ = {};
    function patchProps(el, oldProps, newProps) {
        if (oldProps === newProps) {
            return;
        }
        for (const key in newProps) {
            const preProp = oldProps[key];
            const nextProp = newProps[key];
            if (preProp !== nextProp) {
                hostPatchProp(el, key, preProp, nextProp);
            }
        }
        if (oldProps === EMPTY_OBJ) {
            return;
        }
        // 移除不存在的props
        for (const key in oldProps) {
            if (!(key in newProps)) {
                hostPatchProp(el, key, oldProps[key], null);
            }
        }
    }
    function mountElement(initialVnode, container, parentComponent, anchor) {
        const el = (initialVnode.el = hostCreateElement(initialVnode.type));
        const { children, props } = initialVnode;
        // 处理props
        for (const key in props) {
            const value = props[key];
            hostPatchProp(el, key, null, value);
        }
        // 处理children
        if (typeof children === "string") {
            el.textContent = children;
        }
        else if (Array.isArray(children)) {
            mountChildren(children, el, parentComponent, anchor);
        }
        // 挂载
        hostInsert(el, container, anchor);
    }
    function mountChildren(children, el, parentComponent, anchor) {
        children.forEach((child) => {
            patch(child, null, el, parentComponent, anchor);
        });
    }
    function processComponent(newVNode, oldVNode, container, parentComponent, anchor) {
        if (!oldVNode) {
            mountComponent(newVNode, container, parentComponent, anchor);
        }
        else {
            updateComponent(newVNode, oldVNode);
        }
    }
    function updateComponent(newVNode, oldVNode) {
        var _a;
        const instance = oldVNode === null || oldVNode === void 0 ? void 0 : oldVNode.component;
        if (shouldUpdateComponent(newVNode, oldVNode)) {
            newVNode.component = instance;
            instance.next = newVNode;
            (_a = instance.update) === null || _a === void 0 ? void 0 : _a.call(instance);
        }
        else {
            // 不更新就要重置
            newVNode.component = oldVNode === null || oldVNode === void 0 ? void 0 : oldVNode.component;
            newVNode.el = oldVNode === null || oldVNode === void 0 ? void 0 : oldVNode.el;
            instance.vnode = newVNode;
        }
    }
    function mountComponent(vnode, container, parentComponent, anchor) {
        const instance = createComponentInstance(vnode, parentComponent);
        vnode.component = instance;
        setupComponent(instance);
        setupRenderEffect(instance, vnode, container, anchor);
    }
    function setupRenderEffect(instance, vnode, container, anchor) {
        instance.update = effect(() => {
            if (!instance.isMounted) {
                // 挂载
                const { proxy } = instance;
                const subTree = (instance.subTree = instance.render.call(proxy, proxy));
                patch(subTree, null, container, instance, anchor);
                // 所有的element都已经处理完
                vnode.el = subTree.el;
                instance.isMounted = true;
            }
            else {
                // 更新
                // 更新props
                const { next: newVNode, vnode: preVNode } = instance;
                if (newVNode) {
                    newVNode.el = preVNode.el;
                    updateComponentPreRender(instance, newVNode);
                }
                const { proxy } = instance;
                const subTree = instance.render.call(proxy, proxy);
                const preSubTree = instance.subTree;
                instance.subTree = subTree;
                patch(subTree, preSubTree, container, instance, anchor);
            }
        }, {
            scheduler: () => {
                queueJobs(instance.update);
            },
        });
    }
    function updateComponentPreRender(instance, newVNode) {
        instance.vnode = newVNode;
        instance.next = undefined;
        instance.props = newVNode.props;
    }
    return {
        createApp: createAppAPI(render),
    };
}

function renderSlots(slots, name, props) {
    const slot = slots[name];
    if (slot) {
        let renderSlot = slot;
        if (typeof slot === "function") {
            renderSlot = slot(props);
            renderSlot = Array.isArray(renderSlot) ? renderSlot : [renderSlot];
        }
        return createVNode(Fragment, {}, renderSlot);
    }
    return {};
}

function h(type, propsOrChildren, _children) {
    let props;
    let children;
    if (isProps(propsOrChildren)) {
        props = propsOrChildren;
        children = [];
    }
    else if (isChildren(propsOrChildren)) {
        props = {};
        children = propsOrChildren;
    }
    else {
        props = {};
        children = [];
    }
    if (_children) {
        children = _children;
    }
    return createVNode(type, props, children);
}
function isProps(propsOrChildren) {
    return typeof propsOrChildren === "object" && !Array.isArray(propsOrChildren);
}
function isChildren(propsOrChildren) {
    return typeof propsOrChildren === "string" || Array.isArray(propsOrChildren);
}

function provide(key, value) {
    var _a;
    const currentInstance = getCurrentInstance();
    if (!currentInstance)
        return;
    const parentProvides = (_a = currentInstance.parent) === null || _a === void 0 ? void 0 : _a.provides;
    if (parentProvides) {
        let { provides } = currentInstance;
        if (provides === parentProvides) {
            provides = currentInstance.provides = Object.create(parentProvides);
        }
        if (provides)
            provides[key] = value;
    }
}
function inject(key, defaultVal) {
    var _a;
    const currentInstance = getCurrentInstance();
    if (!currentInstance)
        return;
    const parentProvides = (_a = currentInstance.parent) === null || _a === void 0 ? void 0 : _a.provides;
    if (parentProvides)
        return (parentProvides[key] ||
            (typeof defaultVal === "function" ? defaultVal() : defaultVal));
}

function createElement(type) {
    return document.createElement(type);
}
function patchProp(el, key, oldValue, newValue) {
    const isOn = (key) => /^on[A-Z]/.test(key);
    if (isOn(key)) {
        const event = key.slice(2).toLowerCase();
        el.addEventListener(event, newValue);
        el.removeEventListener(event, oldValue);
    }
    else {
        if (newValue === undefined || newValue === null) {
            el.removeAttribute(key);
        }
        else {
            el.setAttribute(key, newValue);
        }
    }
}
function insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor);
}
function createTextNode(content) {
    return document.createTextNode(content);
}
function remove(child) {
    const parent = child.parentNode;
    if (parent) {
        parent.removeChild(child);
    }
}
function setElementText(el, text) {
    el.textContent = text;
}
const renderer = createRenderer({
    createElement,
    patchProp,
    insert,
    createTextNode,
    remove,
    setElementText,
});
function createApp(...args) {
    return renderer.createApp(...args);
}

var runtimeDom = /*#__PURE__*/Object.freeze({
    __proto__: null,
    computed: computed,
    createApp: createApp,
    createElementVNode: createVNode,
    createRenderer: createRenderer,
    createTextVNode: createTextVNode,
    getCurrentInstance: getCurrentInstance,
    h: h,
    inject: inject,
    nextTick: nextTick,
    provide: provide,
    proxyRefs: proxyRefs,
    reactive: reactive,
    readonly: readonly,
    ref: ref,
    registerRuntimeCompiler: registerRuntimeCompiler,
    renderSlots: renderSlots,
    shallowReadonly: shallowReadonly,
    toDisplayString: toDisplayString
});

const TO_DISPLAY_STRING = Symbol("toDisplayString");
const CREATE_ELEMENT_VNODE = Symbol("createElementVNode");
const helperMapName = {
    [TO_DISPLAY_STRING]: "toDisplayString",
    [CREATE_ELEMENT_VNODE]: "createElementVNode",
};

var NodeTypes;
(function (NodeTypes) {
    NodeTypes[NodeTypes["INTERPOLATION"] = 0] = "INTERPOLATION";
    NodeTypes[NodeTypes["SIMPLE_EXPRESSION"] = 1] = "SIMPLE_EXPRESSION";
    NodeTypes[NodeTypes["ELEMENT"] = 2] = "ELEMENT";
    NodeTypes[NodeTypes["TEXT"] = 3] = "TEXT";
    NodeTypes[NodeTypes["ROOT"] = 4] = "ROOT";
    NodeTypes[NodeTypes["COMPOUND_EXPRESSION"] = 5] = "COMPOUND_EXPRESSION";
})(NodeTypes || (NodeTypes = {}));
var TagType;
(function (TagType) {
    TagType[TagType["START"] = 0] = "START";
    TagType[TagType["END"] = 1] = "END";
})(TagType || (TagType = {}));
function createVNodeCall(context, type, tag, props, children) {
    context.helper(CREATE_ELEMENT_VNODE);
    return {
        type,
        tag,
        props,
        children,
    };
}

function generate(ast) {
    const context = createCodegenContext();
    const { push } = context;
    // 前导码
    genFunctionPreamble(ast, context);
    const functionName = "render";
    const args = ["_ctx", "_cache"];
    const signature = args.join(", ");
    push(`function ${functionName}(${signature}){`);
    push("return ");
    genNode(ast.codegenNode, context);
    push("}");
    return {
        code: context.code,
    };
}
function genFunctionPreamble(ast, context) {
    const { push } = context;
    const VueBinging = "Vue";
    const aliasHelper = (s) => `${helperMapName[s]}: _${helperMapName[s]}`;
    if (ast.helpers.length) {
        push(`const { ${ast.helpers.map(aliasHelper).join(", ")} } = ${VueBinging};`);
    }
    push("return ");
}
function genNode(node, context) {
    switch (node.type) {
        case NodeTypes.TEXT:
            genText(node, context);
            break;
        case NodeTypes.INTERPOLATION:
            genInterpolation(node, context);
            break;
        case NodeTypes.SIMPLE_EXPRESSION:
            genExpression(node, context);
            break;
        case NodeTypes.ELEMENT:
            genElement(node, context);
            break;
        case NodeTypes.COMPOUND_EXPRESSION:
            genCompoundExpression(node, context);
            break;
    }
}
function genCompoundExpression(node, context) {
    const { push } = context;
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (isString(child)) {
            push(child);
        }
        else {
            genNode(child, context);
        }
    }
}
function genElement(node, context) {
    const { push, helper } = context;
    const { tag, children, props } = node;
    push(`${helper(CREATE_ELEMENT_VNODE)}(`);
    genNodeList(genNullable([tag, props, children]), context);
    push(")");
}
function genNodeList(nodes, context) {
    const { push } = context;
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (isString(node)) {
            push(node);
        }
        else {
            genNode(node, context);
        }
        if (i < nodes.length - 1) {
            push(", ");
        }
    }
}
function genNullable(args) {
    return args.map((arg) => arg || "null");
}
function genText(node, context) {
    const { push } = context;
    push(`'${node.content}'`);
}
function genInterpolation(node, context) {
    const { push, helper } = context;
    push(`${helper(TO_DISPLAY_STRING)}(`);
    genNode(node.content, context);
    push(")");
}
function genExpression(node, context) {
    const { push } = context;
    push(`${node.content}`);
}
function createCodegenContext() {
    const context = {
        code: "",
        push(source) {
            context.code += source;
        },
        helper(key) {
            return `_${helperMapName[key]}`;
        },
    };
    return context;
}

function baseParse(content) {
    const context = createParserContext(content);
    return createRoot(parseChildren(context, []));
}
function parseChildren(context, ancestors) {
    const nodes = [];
    while (!isEnd(context, ancestors)) {
        let node;
        // {{}}
        const s = context.source;
        if (s.startsWith("{{")) {
            node = parseInterpolation(context);
        }
        else if (s[0] === "<") {
            // element
            if (/[a-z]/i.test(s[1])) {
                node = parseElement(context, ancestors);
            }
        }
        // text
        if (!node) {
            node = parseText(context, ancestors);
        }
        if (node) {
            nodes.push(node);
        }
    }
    return nodes;
}
function isEnd(context, ancestors) {
    var _a;
    // 1. source有值的时候
    // 2. 遇到结束标签的时候
    const s = context.source;
    const expectTag = (_a = ancestors[ancestors.length - 1]) === null || _a === void 0 ? void 0 : _a.tag;
    for (let i = ancestors.length - 1; i >= 0; i--) {
        const tag = ancestors[i].tag;
        if (s.startsWith(`</${tag}>`)) {
            if (tag !== expectTag) {
                throw Error(`不存在结束标签 </${expectTag}>`);
            }
            else {
                return true;
            }
        }
    }
    return !s;
}
// 处理element
function parseElement(context, ancestors) {
    const element = parseTag(context, TagType.START);
    ancestors.push(element);
    element.children = parseChildren(context, ancestors);
    ancestors.pop();
    parseTag(context, TagType.END);
    return element;
}
function parseTag(context, tagType) {
    const match = /^<\/?([a-z]*)/i.exec(context.source);
    const tag = match[1];
    advanceBy(context, match[0].length);
    advanceBy(context, 1);
    if (tagType === TagType.END)
        return;
    return {
        type: NodeTypes.ELEMENT,
        tag,
        children: [],
    };
}
// 处理插值
function parseInterpolation(context) {
    const openDelimiter = "{{";
    const closeDelimiter = "}}";
    const closeIndex = context.source.indexOf(closeDelimiter, openDelimiter.length);
    advanceBy(context, openDelimiter.length);
    const rawContentLength = closeIndex - openDelimiter.length;
    const rawContent = parseTextData(context, rawContentLength);
    const content = rawContent.trim();
    advanceBy(context, rawContentLength + closeDelimiter.length);
    return {
        type: NodeTypes.INTERPOLATION,
        content: {
            type: NodeTypes.SIMPLE_EXPRESSION,
            content,
        },
    };
}
// 处理text
function parseText(context, ancestors) {
    let endIndex = context.source.length;
    const topElement = ancestors[ancestors.length - 1];
    const endToken = ["{{", `</${(topElement === null || topElement === void 0 ? void 0 : topElement.tag) || ""}>`];
    const index = endToken
        .map((token) => context.source.indexOf(token))
        .filter((i) => i !== -1)
        .sort((a, b) => a - b)[0];
    if (index) {
        endIndex = index;
    }
    const content = parseTextData(context, endIndex);
    advanceBy(context, content.length);
    return {
        type: NodeTypes.TEXT,
        content,
    };
}
function parseTextData(context, length) {
    return context.source.slice(0, length);
}
// 推进删除
function advanceBy(context, length) {
    context.source = context.source.slice(length);
}
function createRoot(children) {
    return {
        children,
        type: NodeTypes.ROOT,
    };
}
function createParserContext(content) {
    return {
        source: content,
    };
}

function transform(root, options = {}) {
    const context = createTransformContext(root, options);
    traverseNode(root, context);
    createRootCodegen(root);
    root.helpers = [...context.helpers.keys()];
}
function createRootCodegen(root) {
    const child = root.children[0];
    if (child.type === NodeTypes.ELEMENT) {
        root.codegenNode = child.codegenNode;
    }
    else {
        root.codegenNode = root.children[0];
    }
}
function createTransformContext(root, options) {
    const context = {
        root,
        nodeTransforms: options.nodeTransforms || [],
        helpers: new Map(),
        helper(key) {
            context.helpers.set(key, 1);
        },
    };
    return context;
}
function traverseNode(node, context) {
    const nodeTransforms = context.nodeTransforms;
    const exitFns = [];
    for (let i = 0; i < nodeTransforms.length; i++) {
        const transform = nodeTransforms[i];
        const onExit = transform(node, context);
        if (onExit)
            exitFns.push(onExit);
    }
    switch (node.type) {
        case NodeTypes.INTERPOLATION:
            context.helper(TO_DISPLAY_STRING);
            break;
        case NodeTypes.ROOT:
        case NodeTypes.ELEMENT:
            traverseChildren(node, context);
            break;
    }
    let i = exitFns.length;
    while (i--) {
        exitFns[i]();
    }
}
function traverseChildren(node, context) {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        const node = children[i];
        traverseNode(node, context);
    }
}

function transformElement(node, context) {
    if (node.type === NodeTypes.ELEMENT) {
        return () => {
            // 中间处理层
            // tag
            const vnodeTag = `"${node.tag}"`;
            // props
            const vnodeProps = null;
            // children
            const children = node.children;
            const vnodeChildren = children[0];
            node.codegenNode = createVNodeCall(context, node.type, vnodeTag, vnodeProps, vnodeChildren);
        };
    }
}

function transformExpression(node) {
    if (node.type === NodeTypes.INTERPOLATION) {
        processExpression(node.content);
    }
}
function processExpression(node) {
    node.content = `_ctx.${node.content}`;
}

function isText(node) {
    return node.type === NodeTypes.TEXT || node.type === NodeTypes.INTERPOLATION;
}

function transformText(node) {
    if (node.type === NodeTypes.ELEMENT) {
        return () => {
            const { children } = node;
            let currentContainer;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (isText(child)) {
                    for (let j = i + 1; j < children.length; j++) {
                        const nextChild = children[j];
                        if (isText(nextChild)) {
                            if (!currentContainer) {
                                currentContainer = children[i] = {
                                    type: NodeTypes.COMPOUND_EXPRESSION,
                                    children: [child],
                                };
                            }
                            currentContainer.children.push(" + ");
                            currentContainer.children.push(nextChild);
                            children.splice(j, 1);
                            j--;
                        }
                        else {
                            currentContainer = undefined;
                            break;
                        }
                    }
                }
            }
        };
    }
}

function baseCompile(template) {
    const ast = baseParse(template);
    transform(ast, {
        nodeTransforms: [
            transformExpression,
            transformElement,
            transformText,
        ],
    });
    return generate(ast);
}

// min-vue出口
function compileToFunction(template) {
    const { code } = baseCompile(template);
    const render = new Function("Vue", code)(runtimeDom);
    return render;
}
registerRuntimeCompiler(compileToFunction);

exports.computed = computed;
exports.createApp = createApp;
exports.createElementVNode = createVNode;
exports.createRenderer = createRenderer;
exports.createTextVNode = createTextVNode;
exports.getCurrentInstance = getCurrentInstance;
exports.h = h;
exports.inject = inject;
exports.nextTick = nextTick;
exports.provide = provide;
exports.proxyRefs = proxyRefs;
exports.reactive = reactive;
exports.readonly = readonly;
exports.ref = ref;
exports.registerRuntimeCompiler = registerRuntimeCompiler;
exports.renderSlots = renderSlots;
exports.shallowReadonly = shallowReadonly;
exports.toDisplayString = toDisplayString;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3VpZGUtbWluLXZ1ZS5janMuanMiLCJzb3VyY2VzIjpbIi4uLy4uL3NoYXJlZC9zcmMvdG9EaXNwbGF5U3RyaW5nLnRzIiwiLi4vLi4vc2hhcmVkL3NyYy9pbmRleC50cyIsIi4uLy4uL3JlYWN0aXZpdHkvc3JjL2VmZmVjdC50cyIsIi4uLy4uL3JlYWN0aXZpdHkvc3JjL2Jhc2VIYW5kbGVyLnRzIiwiLi4vLi4vcmVhY3Rpdml0eS9zcmMvcmVhY3RpdmUudHMiLCIuLi8uLi9yZWFjdGl2aXR5L3NyYy9yZWYudHMiLCIuLi8uLi9yZWFjdGl2aXR5L3NyYy9jb21wdXRlZC50cyIsIi4uLy4uL3J1bnRpbWUtY29yZS9zcmMvY29tcG9uZW50RW1pdC50cyIsIi4uLy4uL3J1bnRpbWUtY29yZS9zcmMvY29tcG9uZW50UHJvcHMudHMiLCIuLi8uLi9ydW50aW1lLWNvcmUvc3JjL2NvbXBvbmVudFB1YmxpY0luc3RhbmNlLnRzIiwiLi4vLi4vcnVudGltZS1jb3JlL3NyYy9jb21wb25lbnRTbG90cy50cyIsIi4uLy4uL3J1bnRpbWUtY29yZS9zcmMvY29tcG9uZW50LnRzIiwiLi4vLi4vcnVudGltZS1jb3JlL3NyYy9jb21wb25lbnRVcGRhdGVVdGlscy50cyIsIi4uLy4uL3J1bnRpbWUtY29yZS9zcmMvdm5vZGUudHMiLCIuLi8uLi9ydW50aW1lLWNvcmUvc3JjL2NyZWF0ZUFwcC50cyIsIi4uLy4uL3J1bnRpbWUtY29yZS9zcmMvc2NoZWR1bGVyLnRzIiwiLi4vLi4vcnVudGltZS1jb3JlL3NyYy9yZW5kZXJlci50cyIsIi4uLy4uL3J1bnRpbWUtY29yZS9zcmMvcmVuZGVyU2xvdHMudHMiLCIuLi8uLi9ydW50aW1lLWNvcmUvc3JjL2gudHMiLCIuLi8uLi9ydW50aW1lLWNvcmUvc3JjL2FwaUluamVjdC50cyIsIi4uLy4uL3J1bnRpbWUtZG9tL3NyYy9pbmRleC50cyIsIi4uLy4uL2NvbXBpbGVyLWNvcmUvc3JjL3J1bnRpbWVIZWxwZXJzLnRzIiwiLi4vLi4vY29tcGlsZXItY29yZS9zcmMvYXN0LnRzIiwiLi4vLi4vY29tcGlsZXItY29yZS9zcmMvY29kZWdlbi50cyIsIi4uLy4uL2NvbXBpbGVyLWNvcmUvc3JjL3BhcnNlLnRzIiwiLi4vLi4vY29tcGlsZXItY29yZS9zcmMvdHJhbnNmb3JtLnRzIiwiLi4vLi4vY29tcGlsZXItY29yZS9zcmMvdHJhbnNmb3Jtcy90cmFuc2Zvcm1FbGVtZW50LnRzIiwiLi4vLi4vY29tcGlsZXItY29yZS9zcmMvdHJhbnNmb3Jtcy90cmFuc2Zvcm1FeHByZXNzaW9uLnRzIiwiLi4vLi4vY29tcGlsZXItY29yZS9zcmMvdXRpbHMudHMiLCIuLi8uLi9jb21waWxlci1jb3JlL3NyYy90cmFuc2Zvcm1zL3RyYW5zZm9ybVRleHQudHMiLCIuLi8uLi9jb21waWxlci1jb3JlL3NyYy9jb21waWxlLnRzIiwiLi4vc3JjL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBmdW5jdGlvbiB0b0Rpc3BsYXlTdHJpbmcodmFsKSB7XHJcbiAgcmV0dXJuIFN0cmluZyh2YWwpXHJcbn1cclxuIiwiZXhwb3J0ICogZnJvbSBcIi4vdG9EaXNwbGF5U3RyaW5nXCJcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBleHRlbmQob3JpZ2luLCAuLi50YXJnZXQpIHtcclxuICByZXR1cm4gT2JqZWN0LmFzc2lnbihvcmlnaW4sIC4uLnRhcmdldClcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlKSB7XHJcbiAgcmV0dXJuIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIlxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNTdHJpbmcodmFsdWUpIHtcclxuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0FycmF5KHZhbHVlKSB7XHJcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsdWUpXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBoYXNDaGFuZ2VkKHZhbHVlLCBuZXdWYWx1ZSkge1xyXG4gIHJldHVybiAhT2JqZWN0LmlzKHZhbHVlLCBuZXdWYWx1ZSlcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnRTdHJpbmdUb0hUTUxFbGVtZW50KFxyXG4gIHJvb3RDb250YWluZXI6IHN0cmluZyB8IEVsZW1lbnRcclxuKTogRWxlbWVudCB7XHJcbiAgbGV0IHJvb3RFbGVtZW50ID0gcm9vdENvbnRhaW5lclxyXG4gIGlmICh0eXBlb2Ygcm9vdENvbnRhaW5lciA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgcm9vdEVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHJvb3RDb250YWluZXIpIGFzIEVsZW1lbnRcclxuICB9XHJcbiAgcmV0dXJuIHJvb3RFbGVtZW50IGFzIEVsZW1lbnRcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGhhc093bih2YWw6IG9iamVjdCwga2V5OiBzdHJpbmcpIHtcclxuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbCwga2V5KVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2FtZWxpemUoc3RyOiBzdHJpbmcpIHtcclxuICByZXR1cm4gc3RyLnJlcGxhY2UoLy0oXFx3KS9nLCAoXywgYzogc3RyaW5nKSA9PiB7XHJcbiAgICByZXR1cm4gYyA/IGMudG9VcHBlckNhc2UoKSA6IFwiXCJcclxuICB9KVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2FwaXRhbGl6ZShzdHI6IHN0cmluZykge1xyXG4gIHJldHVybiBzdHIuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzdHIuc2xpY2UoMSlcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHRvSGFuZGxlcktleShzdHI6IHN0cmluZykge1xyXG4gIHJldHVybiBzdHIgPyBcIm9uXCIgKyBjYXBpdGFsaXplKHN0cikgOiBcIlwiXHJcbn1cclxuIiwiaW1wb3J0IHsgZXh0ZW5kIH0gZnJvbSBcIkBtaW4tdnVlL3NoYXJlZFwiXHJcblxyXG4vLyDlvZPliY3nmoTlia/kvZznlKjlh73mlbBcclxubGV0IGFjdGl2ZUVmZmVjdDogbnVsbCB8IFJlYWN0aXZlRWZmZWN0ID0gbnVsbFxyXG4vLyDmlLbpm4ZlZmZlY3Tlh73mlbBcclxuY29uc3QgYnVja2V0ID0gbmV3IFdlYWtNYXAoKVxyXG5sZXQgc2hvdWxkVHJhY2sgPSBmYWxzZVxyXG5leHBvcnQgY2xhc3MgUmVhY3RpdmVFZmZlY3Qge1xyXG4gIHByaXZhdGUgX2ZuOiBhbnlcclxuICAvLyDmmK/lkKbmsqHmnIlzdG9w6L+HXHJcbiAgcHJpdmF0ZSBhY3RpdmU6IGJvb2xlYW4gPSB0cnVlXHJcbiAgZGVwczogU2V0PFJlYWN0aXZlRWZmZWN0PltdID0gW11cclxuICBvblN0b3A6IEZ1bmN0aW9uIHwgdW5kZWZpbmVkXHJcblxyXG4gIGNvbnN0cnVjdG9yKGZuOiBGdW5jdGlvbiwgcHVibGljIHNjaGVkdWxlcj86IEZ1bmN0aW9uKSB7XHJcbiAgICB0aGlzLl9mbiA9IGZuXHJcbiAgICB0aGlzLnNjaGVkdWxlciA9IHNjaGVkdWxlclxyXG4gIH1cclxuXHJcbiAgcnVuKCkge1xyXG4gICAgaWYgKCF0aGlzLmFjdGl2ZSkge1xyXG4gICAgICByZXR1cm4gdGhpcy5fZm4oKVxyXG4gICAgfVxyXG5cclxuICAgIHNob3VsZFRyYWNrID0gdHJ1ZVxyXG5cclxuICAgIGFjdGl2ZUVmZmVjdCA9IHRoaXNcclxuICAgIGNvbnN0IHJlcyA9IHRoaXMuX2ZuKClcclxuICAgIHNob3VsZFRyYWNrID0gZmFsc2VcclxuICAgIGFjdGl2ZUVmZmVjdCA9IG51bGxcclxuICAgIHJldHVybiByZXNcclxuICB9XHJcbiAgc3RvcCgpIHtcclxuICAgIGlmICh0aGlzLmFjdGl2ZSkge1xyXG4gICAgICBjbGVhbnVwRWZmZWN0KHRoaXMpXHJcbiAgICAgIGlmICh0aGlzLm9uU3RvcCkge1xyXG4gICAgICAgIHRoaXMub25TdG9wKClcclxuICAgICAgfVxyXG4gICAgICB0aGlzLmFjdGl2ZSA9IGZhbHNlXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjbGVhbnVwRWZmZWN0KGVmZmVjdDogUmVhY3RpdmVFZmZlY3QpIHtcclxuICBlZmZlY3QuZGVwcy5mb3JFYWNoKChkZXA6IFNldDxSZWFjdGl2ZUVmZmVjdD4pID0+IHtcclxuICAgIGRlcC5kZWxldGUoZWZmZWN0KVxyXG4gIH0pXHJcbiAgZWZmZWN0LmRlcHMubGVuZ3RoID0gMFxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdHJhY2sodGFyZ2V0LCBrZXkpIHtcclxuICBpZiAoIWFjdGl2ZUVmZmVjdCkge1xyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG4gIGxldCBkZXBzTWFwID0gYnVja2V0LmdldCh0YXJnZXQpXHJcbiAgaWYgKCFkZXBzTWFwKSB7XHJcbiAgICBidWNrZXQuc2V0KHRhcmdldCwgKGRlcHNNYXAgPSBuZXcgTWFwKCkpKVxyXG4gIH1cclxuICBsZXQgZGVwc1NldCA9IGRlcHNNYXAuZ2V0KGtleSlcclxuICBpZiAoIWRlcHNTZXQpIHtcclxuICAgIGRlcHNNYXAuc2V0KGtleSwgKGRlcHNTZXQgPSBuZXcgU2V0KCkpKVxyXG4gIH1cclxuICB0cmFja0VmZmVjdChkZXBzU2V0KVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdHJhY2tFZmZlY3QoZGVwc1NldCkge1xyXG4gIGlmICghYWN0aXZlRWZmZWN0KSB7XHJcbiAgICByZXR1cm5cclxuICB9XHJcbiAgaWYgKGRlcHNTZXQuaGFzKGFjdGl2ZUVmZmVjdCkpIHtcclxuICAgIHJldHVyblxyXG4gIH1cclxuICBkZXBzU2V0LmFkZChhY3RpdmVFZmZlY3QpXHJcbiAgLy8g5Y+N5ZCR5pS26ZuG77yM55So5LqO5a6e546wc3RvcFxyXG4gIGFjdGl2ZUVmZmVjdC5kZXBzLnB1c2goZGVwc1NldClcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXIodGFyZ2V0LCBrZXkpIHtcclxuICBjb25zdCBkZXBzTWFwID0gYnVja2V0LmdldCh0YXJnZXQpXHJcbiAgaWYgKCFkZXBzTWFwKSB7XHJcbiAgICByZXR1cm5cclxuICB9XHJcbiAgY29uc3QgZGVwc1NldCA9IGRlcHNNYXAuZ2V0KGtleSlcclxuICB0cmlnZ2VyRWZmZWN0KGRlcHNTZXQpXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyRWZmZWN0KGRlcHNTZXQ6IGFueSkge1xyXG4gIGNvbnN0IGVmZmVjdFRvUnVuID0gbmV3IFNldDxSZWFjdGl2ZUVmZmVjdD4oKVxyXG4gIGRlcHNTZXQgJiZcclxuICAgIGRlcHNTZXQuZm9yRWFjaCgoZWZmZWN0OiBSZWFjdGl2ZUVmZmVjdCkgPT4ge1xyXG4gICAgICBpZiAoYWN0aXZlRWZmZWN0ICE9PSBlZmZlY3QpIHtcclxuICAgICAgICBlZmZlY3RUb1J1bi5hZGQoZWZmZWN0KVxyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gIGVmZmVjdFRvUnVuLmZvckVhY2goKGVmZmVjdCkgPT4ge1xyXG4gICAgaWYgKGVmZmVjdC5zY2hlZHVsZXIpIHtcclxuICAgICAgZWZmZWN0LnNjaGVkdWxlcigpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBlZmZlY3QucnVuKClcclxuICAgIH1cclxuICB9KVxyXG59XHJcblxyXG50eXBlIE9wdGlvbnMgPSB7XHJcbiAgc2NoZWR1bGVyPzogRnVuY3Rpb25cclxuICBvblN0b3A/OiBGdW5jdGlvblxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZWZmZWN0KGZuOiBGdW5jdGlvbiwgb3B0aW9uczogT3B0aW9ucyA9IHt9KSB7XHJcbiAgY29uc3QgX2VmZmVjdCA9IG5ldyBSZWFjdGl2ZUVmZmVjdChmbiwgb3B0aW9ucy5zY2hlZHVsZXIpXHJcbiAgZXh0ZW5kKF9lZmZlY3QsIG9wdGlvbnMpXHJcblxyXG4gIF9lZmZlY3QucnVuKClcclxuICBjb25zdCBydW5uZXIgPSBfZWZmZWN0LnJ1bi5iaW5kKF9lZmZlY3QpXHJcbiAgOyhydW5uZXIgYXMgYW55KS5lZmZlY3QgPSBfZWZmZWN0XHJcbiAgcmV0dXJuIHJ1bm5lclxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc3RvcChydW5uZXI6IGFueSkge1xyXG4gIHJ1bm5lci5lZmZlY3Quc3RvcCgpXHJcbn1cclxuIiwiaW1wb3J0IHsgZXh0ZW5kLCBpc09iamVjdCB9IGZyb20gXCJAbWluLXZ1ZS9zaGFyZWRcIlxyXG5pbXBvcnQgeyB0cmFjaywgdHJpZ2dlciB9IGZyb20gXCIuL2VmZmVjdFwiXHJcbmltcG9ydCB7IFJlYWN0aXZlRmxhZ3MsIHJlYWN0aXZlLCByZWFkb25seSB9IGZyb20gXCIuL3JlYWN0aXZlXCJcclxuXHJcbmNvbnN0IGdldCA9IGNyZWF0ZUdldHRlcigpXHJcbmNvbnN0IHNldCA9IGNyZWF0ZVNldHRlcigpXHJcbmNvbnN0IHJlYWRvbmx5R2V0ID0gY3JlYXRlR2V0dGVyKHRydWUpXHJcbmNvbnN0IHNoYWxsb3dSZWFkb25seUdldCA9IGNyZWF0ZUdldHRlcih0cnVlLCB0cnVlKVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlR2V0dGVyKGlzUmVhZG9ubHk6IGJvb2xlYW4gPSBmYWxzZSwgc2hhbGxvdzogYm9vbGVhbiA9IGZhbHNlKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uIGdldCh0YXJnZXQsIGtleSwgcmVjZWl2ZXIpIHtcclxuICAgIGlmIChrZXkgPT09IFJlYWN0aXZlRmxhZ3MuSVNfUkVBQ1RJVkUpIHtcclxuICAgICAgcmV0dXJuICFpc1JlYWRvbmx5XHJcbiAgICB9IGVsc2UgaWYgKGtleSA9PT0gUmVhY3RpdmVGbGFncy5JU19SRUFET05MWSkge1xyXG4gICAgICByZXR1cm4gaXNSZWFkb25seVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHJlcyA9IFJlZmxlY3QuZ2V0KHRhcmdldCwga2V5LCByZWNlaXZlcilcclxuXHJcbiAgICBpZiAoc2hhbGxvdykge1xyXG4gICAgICByZXR1cm4gcmVzXHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFpc1JlYWRvbmx5KSB7XHJcbiAgICAgIHRyYWNrKHRhcmdldCwga2V5KVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChpc09iamVjdChyZXMpKSB7XHJcbiAgICAgIHJldHVybiBpc1JlYWRvbmx5ID8gcmVhZG9ubHkocmVzKSA6IHJlYWN0aXZlKHJlcylcclxuICAgIH1cclxuICAgIHJldHVybiByZXNcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVNldHRlcigpIHtcclxuICByZXR1cm4gZnVuY3Rpb24gc2V0KHRhcmdldCwga2V5LCBuZXdWYWx1ZSwgcmVjZWl2ZXIpIHtcclxuICAgIGNvbnN0IHJlcyA9IFJlZmxlY3Quc2V0KHRhcmdldCwga2V5LCBuZXdWYWx1ZSwgcmVjZWl2ZXIpXHJcbiAgICAvLyDop6blj5Hkvp3otZZcclxuICAgIHRyaWdnZXIodGFyZ2V0LCBrZXkpXHJcbiAgICByZXR1cm4gcmVzXHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgY29uc3QgbXV0YWJsZUhhbmRsZXJzID0ge1xyXG4gIGdldCxcclxuICBzZXQsXHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCByZWFkb25seUhhbmRsZXJzID0ge1xyXG4gIGdldDogcmVhZG9ubHlHZXQsXHJcbiAgc2V0KHRhcmdldCwga2V5LCBuZXdWYWx1ZSkge1xyXG4gICAgY29uc29sZS53YXJuKGByZWFkb25seSDkuI3og73kv67mlLk6IOiuvue9riAke3RhcmdldH0g5Lit55qEICR7a2V5feaXtmApXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG4gIH0sXHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBzaGFsbG93UmVhZG9ubHlIYW5kbGVycyA9IGV4dGVuZCh7fSwgcmVhZG9ubHlIYW5kbGVycywge1xyXG4gIGdldDogc2hhbGxvd1JlYWRvbmx5R2V0LFxyXG59KVxyXG4iLCJpbXBvcnQgeyBpc09iamVjdCB9IGZyb20gXCJAbWluLXZ1ZS9zaGFyZWRcIlxyXG5pbXBvcnQge1xyXG4gIG11dGFibGVIYW5kbGVycyxcclxuICByZWFkb25seUhhbmRsZXJzLFxyXG4gIHNoYWxsb3dSZWFkb25seUhhbmRsZXJzLFxyXG59IGZyb20gXCIuL2Jhc2VIYW5kbGVyXCJcclxuXHJcbmV4cG9ydCBjb25zdCBlbnVtIFJlYWN0aXZlRmxhZ3Mge1xyXG4gIElTX1JFQUNUSVZFID0gXCJfX3ZfaXNSZWFjdGl2ZVwiLFxyXG4gIElTX1JFQURPTkxZID0gXCJfX3ZfaXNSZWFkb25seVwiLFxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVhY3RpdmUocmF3KSB7XHJcbiAgcmV0dXJuIGNyZWF0ZUFjdGl2ZU9iamVjdChyYXcsIG11dGFibGVIYW5kbGVycylcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRvbmx5KHJhdykge1xyXG4gIHJldHVybiBjcmVhdGVBY3RpdmVPYmplY3QocmF3LCByZWFkb25seUhhbmRsZXJzKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2hhbGxvd1JlYWRvbmx5KHJhdykge1xyXG4gIHJldHVybiBjcmVhdGVBY3RpdmVPYmplY3QocmF3LCBzaGFsbG93UmVhZG9ubHlIYW5kbGVycylcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlQWN0aXZlT2JqZWN0KHRhcmdldCwgYmFzZUhhbmRsZXJzKSB7XHJcbiAgaWYgKCFpc09iamVjdCh0YXJnZXQpKSB7XHJcbiAgICBjb25zb2xlLndhcm4oYHRhcmdldCAke3RhcmdldH0g5b+F6aG75piv5LiA5Liq5a+56LGhYClcclxuICB9XHJcbiAgcmV0dXJuIG5ldyBQcm94eSh0YXJnZXQsIGJhc2VIYW5kbGVycylcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzUmVhY3RpdmUob2JzZXJ2ZWQpIHtcclxuICByZXR1cm4gISFvYnNlcnZlZFtSZWFjdGl2ZUZsYWdzLklTX1JFQUNUSVZFXVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNSZWFkb25seShvYnNlcnZlZCkge1xyXG4gIHJldHVybiAhIW9ic2VydmVkW1JlYWN0aXZlRmxhZ3MuSVNfUkVBRE9OTFldXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc1Byb3h5KHZhbHVlKSB7XHJcbiAgcmV0dXJuIGlzUmVhY3RpdmUodmFsdWUpIHx8IGlzUmVhZG9ubHkodmFsdWUpXHJcbn1cclxuIiwiaW1wb3J0IHsgaGFzQ2hhbmdlZCwgaXNBcnJheSwgaXNPYmplY3QgfSBmcm9tIFwiQG1pbi12dWUvc2hhcmVkXCJcclxuaW1wb3J0IHsgdHJhY2tFZmZlY3QsIHRyaWdnZXJFZmZlY3QgfSBmcm9tIFwiLi9lZmZlY3RcIlxyXG5pbXBvcnQgeyByZWFjdGl2ZSB9IGZyb20gXCIuL3JlYWN0aXZlXCJcclxuXHJcbmNsYXNzIFJlZkltcGwge1xyXG4gIHByaXZhdGUgX3ZhbHVlOiBhbnlcclxuICBwcml2YXRlIGRlcHNTZXRcclxuICBwcml2YXRlIF9yb3dWYWx1ZTogYW55XHJcbiAgcHVibGljIF9fdl9pc1JlZiA9IHRydWVcclxuICBjb25zdHJ1Y3Rvcih2YWx1ZSkge1xyXG4gICAgdGhpcy5fdmFsdWUgPSBjb252ZXJ0KHZhbHVlKVxyXG4gICAgdGhpcy5fcm93VmFsdWUgPSB2YWx1ZVxyXG4gICAgdGhpcy5kZXBzU2V0ID0gbmV3IFNldCgpXHJcbiAgfVxyXG5cclxuICBnZXQgdmFsdWUoKTogYW55IHtcclxuICAgIHRyYWNrRWZmZWN0KHRoaXMuZGVwc1NldClcclxuICAgIHJldHVybiB0aGlzLl92YWx1ZVxyXG4gIH1cclxuXHJcbiAgc2V0IHZhbHVlKG5ld1ZhbHVlOiBhbnkpIHtcclxuICAgIGlmIChoYXNDaGFuZ2VkKHRoaXMuX3Jvd1ZhbHVlLCBuZXdWYWx1ZSkpIHtcclxuICAgICAgdGhpcy5fdmFsdWUgPSBjb252ZXJ0KG5ld1ZhbHVlKVxyXG4gICAgICB0aGlzLl9yb3dWYWx1ZSA9IG5ld1ZhbHVlXHJcbiAgICAgIHRyaWdnZXJFZmZlY3QodGhpcy5kZXBzU2V0KVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY29udmVydCh2YWx1ZSkge1xyXG4gIHJldHVybiBpc09iamVjdCh2YWx1ZSkgPyByZWFjdGl2ZSh2YWx1ZSkgOiB2YWx1ZVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVmKHZhbHVlKSB7XHJcbiAgcmV0dXJuIG5ldyBSZWZJbXBsKHZhbHVlKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNSZWYocmVmKSB7XHJcbiAgcmV0dXJuICEhcmVmLl9fdl9pc1JlZlxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdW5SZWYocmVmKSB7XHJcbiAgcmV0dXJuIGlzUmVmKHJlZikgPyByZWYudmFsdWUgOiByZWZcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHByb3h5UmVmcyhvYmplY3RXaXRoUmVmcykge1xyXG4gIHJldHVybiBuZXcgUHJveHkob2JqZWN0V2l0aFJlZnMsIHtcclxuICAgIGdldCh0YXJnZXQsIGtleSwgcmVjZWl2ZXIpIHtcclxuICAgICAgcmV0dXJuIHVuUmVmKFJlZmxlY3QuZ2V0KHRhcmdldCwga2V5LCByZWNlaXZlcikpXHJcbiAgICB9LFxyXG4gICAgc2V0KHRhcmdldCwga2V5LCBuZXdWYWx1ZSwgcmVjZWl2ZXIpIHtcclxuICAgICAgaWYgKGlzUmVmKHRhcmdldFtrZXldKSAmJiAhaXNSZWYobmV3VmFsdWUpKSB7XHJcbiAgICAgICAgcmV0dXJuICh0YXJnZXRba2V5XS52YWx1ZSA9IG5ld1ZhbHVlKVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiBSZWZsZWN0LnNldCh0YXJnZXQsIGtleSwgbmV3VmFsdWUsIHJlY2VpdmVyKVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gIH0pXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0b1JlZjxUPih2YWx1ZTogVClcclxuZXhwb3J0IGZ1bmN0aW9uIHRvUmVmPFQgZXh0ZW5kcyBvYmplY3QsIEsgZXh0ZW5kcyBrZXlvZiBUPihcclxuICBzb3VyY2U6IFQsXHJcbiAga2V5PzogSyxcclxuICBkZWZhdWx0VmFsdWU/OiB1bmtub3duXHJcbilcclxuZXhwb3J0IGZ1bmN0aW9uIHRvUmVmPFQgZXh0ZW5kcyBvYmplY3QsIEsgZXh0ZW5kcyBrZXlvZiBUPihcclxuICBzb3VyY2U6IFQsXHJcbiAga2V5PzogSyxcclxuICBkZWZhdWx0VmFsdWU/OiB1bmtub3duXHJcbikge1xyXG4gIGlmIChpc1JlZihzb3VyY2UpKSB7XHJcbiAgICByZXR1cm4gc291cmNlXHJcbiAgfSBlbHNlIGlmIChpc09iamVjdChzb3VyY2UpICYmIGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XHJcbiAgICByZXR1cm4gcHJvcGVydHlUb1JlZihzb3VyY2UsIGtleSEsIGRlZmF1bHRWYWx1ZSlcclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuIHJlZihzb3VyY2UpXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBwcm9wZXJ0eVRvUmVmKFxyXG4gIHNvdXJjZTogUmVjb3JkPHN0cmluZywgYW55PixcclxuICBrZXk6IGFueSxcclxuICBkZWZhdWx0VmFsdWU/OiB1bmtub3duXHJcbikge1xyXG4gIGNvbnN0IHZhbCA9IHNvdXJjZVtrZXldXHJcbiAgcmV0dXJuIGlzUmVmKHZhbCkgPyB2YWwgOiBuZXcgT2JqZWN0UmVmSW1wbChzb3VyY2UsIGtleSwgZGVmYXVsdFZhbHVlKVxyXG59XHJcblxyXG5jbGFzcyBPYmplY3RSZWZJbXBsPFQgZXh0ZW5kcyBvYmplY3QsIEsgZXh0ZW5kcyBrZXlvZiBUPiB7XHJcbiAgcHVibGljIHJlYWRvbmx5IF9fdl9pc1JlZiA9IHRydWVcclxuXHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9vYmplY3Q6IFQsXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9rZXk6IEssXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0VmFsdWU/OiBUW0tdXHJcbiAgKSB7fVxyXG5cclxuICBnZXQgdmFsdWUoKSB7XHJcbiAgICBjb25zdCB2YWwgPSB0aGlzLl9vYmplY3RbdGhpcy5fa2V5XVxyXG4gICAgcmV0dXJuIHZhbCA9PT0gdW5kZWZpbmVkID8gdGhpcy5fZGVmYXVsdFZhbHVlISA6IHZhbFxyXG4gIH1cclxuXHJcbiAgc2V0IHZhbHVlKG5ld1ZhbCkge1xyXG4gICAgdGhpcy5fb2JqZWN0W3RoaXMuX2tleV0gPSBuZXdWYWxcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0b1JlZnM8VCBleHRlbmRzIG9iamVjdD4ob2JqZWN0OiBUKSB7XHJcbiAgY29uc3QgcmV0OiBhbnkgPSBpc0FycmF5KG9iamVjdCkgPyBuZXcgQXJyYXkoKG9iamVjdCBhcyBhbnlbXSkubGVuZ3RoKSA6IHt9XHJcbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XHJcbiAgICByZXRba2V5XSA9IHByb3BlcnR5VG9SZWYob2JqZWN0LCBrZXkpXHJcbiAgfVxyXG4gIHJldHVybiByZXRcclxufVxyXG4iLCJpbXBvcnQgeyBSZWFjdGl2ZUVmZmVjdCB9IGZyb20gXCIuL2VmZmVjdFwiXHJcblxyXG5jbGFzcyBDb21wdXRlZFJlZkltcGwge1xyXG4gIHByaXZhdGUgX2RpcnR5OiBib29sZWFuID0gdHJ1ZVxyXG4gIHByaXZhdGUgX3ZhbHVlOiBhbnlcclxuICBwcml2YXRlIF9lZmZlY3Q6IFJlYWN0aXZlRWZmZWN0XHJcblxyXG4gIGNvbnN0cnVjdG9yKGdldHRlcjogRnVuY3Rpb24pIHtcclxuICAgIHRoaXMuX2VmZmVjdCA9IG5ldyBSZWFjdGl2ZUVmZmVjdChnZXR0ZXIsICgpID0+IHtcclxuICAgICAgaWYgKCF0aGlzLl9kaXJ0eSkge1xyXG4gICAgICAgIHRoaXMuX2RpcnR5ID0gdHJ1ZVxyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgZ2V0IHZhbHVlKCk6IGFueSB7XHJcbiAgICBpZiAodGhpcy5fZGlydHkpIHtcclxuICAgICAgdGhpcy5fZGlydHkgPSBmYWxzZVxyXG4gICAgICB0aGlzLl92YWx1ZSA9IHRoaXMuX2VmZmVjdC5ydW4oKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuX3ZhbHVlXHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZWQoZ2V0dGVyKSB7XHJcbiAgcmV0dXJuIG5ldyBDb21wdXRlZFJlZkltcGwoZ2V0dGVyKVxyXG59XHJcbiIsImltcG9ydCB7IGNhbWVsaXplLCB0b0hhbmRsZXJLZXkgfSBmcm9tIFwiQG1pbi12dWUvc2hhcmVkXCJcclxuaW1wb3J0IHsgQ29tcG9uZW50SW5zdGFuY2UgfSBmcm9tIFwiLi9jb21wb25lbnRcIlxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGVtaXQoaW5zdGFuY2U6IENvbXBvbmVudEluc3RhbmNlLCBldmVudDogc3RyaW5nLCAuLi5hcmdzKSB7XHJcbiAgY29uc3QgeyBwcm9wcyB9ID0gaW5zdGFuY2VcclxuXHJcbiAgY29uc3QgaGFuZGxlck5hbWUgPSB0b0hhbmRsZXJLZXkoY2FtZWxpemUoZXZlbnQpKVxyXG4gIGNvbnN0IGhhbmRsZXIgPSBwcm9wc1toYW5kbGVyTmFtZV1cclxuICBoYW5kbGVyICYmIGhhbmRsZXIoLi4uYXJncylcclxufVxyXG4iLCJpbXBvcnQgeyBDb21wb25lbnRJbnN0YW5jZSB9IGZyb20gXCIuL2NvbXBvbmVudFwiXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaW5pdFByb3BzKGluc3RhbmNlOiBDb21wb25lbnRJbnN0YW5jZSwgcmF3UHJvcHM6IG9iamVjdCkge1xyXG4gIGluc3RhbmNlLnByb3BzID0gcmF3UHJvcHNcclxufVxyXG4iLCJpbXBvcnQgeyBoYXNPd24gfSBmcm9tIFwiQG1pbi12dWUvc2hhcmVkXCJcclxuXHJcbmNvbnN0IHB1YmxpY1Byb3BlcnRpZXNNYXAgPSB7XHJcbiAgJGVsOiAoaSkgPT4gaS52bm9kZS5lbCxcclxuICAkc2xvdHM6IChpKSA9PiBpLnNsb3RzLFxyXG4gICRwcm9wczogKGkpID0+IGkucHJvcHMsXHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBQdWJsaWNJbnN0YW5jZVByb3h5SGFuZGxlcnMgPSB7XHJcbiAgZ2V0KHsgXzogaW5zdGFuY2UgfSwga2V5KSB7XHJcbiAgICBjb25zdCB7IHNldHVwU3RhdGUsIHByb3BzIH0gPSBpbnN0YW5jZVxyXG5cclxuICAgIGlmIChoYXNPd24oc2V0dXBTdGF0ZSwga2V5KSkge1xyXG4gICAgICByZXR1cm4gc2V0dXBTdGF0ZSFba2V5XVxyXG4gICAgfSBlbHNlIGlmIChoYXNPd24ocHJvcHMsIGtleSkpIHtcclxuICAgICAgcmV0dXJuIHByb3BzW2tleV1cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBwdWJsaWNHZXR0ZXIgPSBwdWJsaWNQcm9wZXJ0aWVzTWFwW2tleV1cclxuICAgIHJldHVybiBwdWJsaWNHZXR0ZXIgJiYgcHVibGljR2V0dGVyKGluc3RhbmNlKVxyXG4gIH0sXHJcbn1cclxuIiwiaW1wb3J0IHsgQ29tcG9uZW50SW5zdGFuY2UgfSBmcm9tIFwiLi9jb21wb25lbnRcIlxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGluaXRTbG90cyhcclxuICBpbnN0YW5jZTogQ29tcG9uZW50SW5zdGFuY2UsXHJcbiAgY2hpbGRyZW46IGFueVtdIHwgb2JqZWN0XHJcbikge1xyXG4gIC8vIGFycmF5IG9yIG9iamVjdFxyXG4gIC8vIGluc3RhbmNlLnNsb3RzID0gQXJyYXkuaXNBcnJheShjaGlsZHJlbikgPyBjaGlsZHJlbiA6IFtjaGlsZHJlbl1cclxuXHJcbiAgY29uc3Qgc2xvdHMgPSB7fVxyXG4gIGZvciAoY29uc3Qga2V5IGluIGNoaWxkcmVuKSB7XHJcbiAgICBjb25zdCB2YWx1ZSA9IGNoaWxkcmVuW2tleV1cclxuICAgIHNsb3RzW2tleV0gPSBBcnJheS5pc0FycmF5KHZhbHVlKVxyXG4gICAgICA/IHZhbHVlXHJcbiAgICAgIDogdHlwZW9mIHZhbHVlID09PSBcImZ1bmN0aW9uXCJcclxuICAgICAgPyB2YWx1ZVxyXG4gICAgICA6IFt2YWx1ZV1cclxuICB9XHJcbiAgaW5zdGFuY2Uuc2xvdHMgPSBzbG90c1xyXG59XHJcbiIsImltcG9ydCB7IHByb3h5UmVmcyB9IGZyb20gXCJAbWluLXZ1ZS9yZWFjdGl2aXR5XCJcclxuaW1wb3J0IHsgc2hhbGxvd1JlYWRvbmx5IH0gZnJvbSBcIkBtaW4tdnVlL3JlYWN0aXZpdHlcIlxyXG5pbXBvcnQgeyBlbWl0IH0gZnJvbSBcIi4vY29tcG9uZW50RW1pdFwiXHJcbmltcG9ydCB7IGluaXRQcm9wcyB9IGZyb20gXCIuL2NvbXBvbmVudFByb3BzXCJcclxuaW1wb3J0IHsgUHVibGljSW5zdGFuY2VQcm94eUhhbmRsZXJzIH0gZnJvbSBcIi4vY29tcG9uZW50UHVibGljSW5zdGFuY2VcIlxyXG5pbXBvcnQgeyBpbml0U2xvdHMgfSBmcm9tIFwiLi9jb21wb25lbnRTbG90c1wiXHJcbmltcG9ydCB7IENvbXBvbmVudCB9IGZyb20gXCIuL2hcIlxyXG5pbXBvcnQgeyBWTm9kZSB9IGZyb20gXCIuL3Zub2RlXCJcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQ29tcG9uZW50SW5zdGFuY2Uge1xyXG4gIHZub2RlOiBWTm9kZVxyXG4gIHR5cGU6IFZOb2RlW1widHlwZVwiXVxyXG4gIHByb3BzOiBvYmplY3RcclxuICBlbWl0OiBGdW5jdGlvblxyXG4gIHNsb3RzOiBvYmplY3RcclxuICBwcm92aWRlcz86IG9iamVjdFxyXG4gIHBhcmVudD86IENvbXBvbmVudEluc3RhbmNlXHJcbiAgc2V0dXBTdGF0ZT86IG9iamVjdFxyXG4gIHJlbmRlcj86IENvbXBvbmVudFtcInJlbmRlclwiXVxyXG4gIHByb3h5PzogYW55XHJcbiAgaXNNb3VudGVkOiBib29sZWFuXHJcbiAgc3ViVHJlZTogVk5vZGUgfCBudWxsXHJcbiAgdXBkYXRlPzogRnVuY3Rpb24gfCBudWxsXHJcbiAgbmV4dD86IFZOb2RlXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDb21wb25lbnRJbnN0YW5jZShcclxuICB2bm9kZTogVk5vZGUsXHJcbiAgcGFyZW50PzogQ29tcG9uZW50SW5zdGFuY2VcclxuKTogQ29tcG9uZW50SW5zdGFuY2Uge1xyXG4gIGNvbnN0IGNvbXBvbmVudDogQ29tcG9uZW50SW5zdGFuY2UgPSB7XHJcbiAgICB2bm9kZSxcclxuICAgIHByb3BzOiB7fSxcclxuICAgIGVtaXQ6ICgpOiB2b2lkID0+IHt9LFxyXG4gICAgc2xvdHM6IHt9LFxyXG4gICAgcHJvdmlkZXM6IHBhcmVudCA/IHBhcmVudC5wcm92aWRlcyA6IHt9LFxyXG4gICAgcGFyZW50LFxyXG4gICAgdHlwZTogdm5vZGUudHlwZSxcclxuICAgIHNldHVwU3RhdGU6IHt9LFxyXG4gICAgaXNNb3VudGVkOiBmYWxzZSxcclxuICAgIHN1YlRyZWU6IG51bGwsXHJcbiAgfVxyXG5cclxuICBjb21wb25lbnQuZW1pdCA9IGVtaXQuYmluZChudWxsLCBjb21wb25lbnQpXHJcblxyXG4gIHJldHVybiBjb21wb25lbnRcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwQ29tcG9uZW50KGluc3RhbmNlOiBDb21wb25lbnRJbnN0YW5jZSkge1xyXG4gIGluaXRQcm9wcyhpbnN0YW5jZSwgaW5zdGFuY2Uudm5vZGUucHJvcHMpXHJcbiAgaW5pdFNsb3RzKGluc3RhbmNlLCBpbnN0YW5jZS52bm9kZS5jaGlsZHJlbiBhcyBhbnkpXHJcblxyXG4gIHNldHVwU3RhdGVmdWxDb21wb25lbnQoaW5zdGFuY2UpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwU3RhdGVmdWxDb21wb25lbnQoaW5zdGFuY2U6IENvbXBvbmVudEluc3RhbmNlKSB7XHJcbiAgY29uc3QgQ29tcG9uZW50ID0gaW5zdGFuY2UudHlwZSBhcyBDb21wb25lbnRcclxuXHJcbiAgaW5zdGFuY2UucHJveHkgPSBuZXcgUHJveHkoeyBfOiBpbnN0YW5jZSB9LCBQdWJsaWNJbnN0YW5jZVByb3h5SGFuZGxlcnMpXHJcblxyXG4gIGNvbnN0IHsgc2V0dXAgfSA9IENvbXBvbmVudFxyXG5cclxuICBpZiAoc2V0dXApIHtcclxuICAgIHNldEN1cnJlbnRJbnN0YW5jZShpbnN0YW5jZSlcclxuICAgIC8vIHNldHVw5Y+v5Lul6L+U5Zue5LiA5Liq5a+56LGh5oiW6ICF5riy5p+T5Ye95pWwXHJcbiAgICBjb25zdCBzZXR1cFJlc3VsdCA9IHByb3h5UmVmcyhcclxuICAgICAgc2V0dXAoc2hhbGxvd1JlYWRvbmx5KGluc3RhbmNlLnByb3BzKSwge1xyXG4gICAgICAgIGVtaXQ6IGluc3RhbmNlLmVtaXQsXHJcbiAgICAgIH0pXHJcbiAgICApXHJcbiAgICBzZXRDdXJyZW50SW5zdGFuY2UobnVsbClcclxuXHJcbiAgICBoYW5kbGVTZXR1cFJlc3VsdChpbnN0YW5jZSwgc2V0dXBSZXN1bHQpXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBoYW5kbGVTZXR1cFJlc3VsdChpbnN0YW5jZTogQ29tcG9uZW50SW5zdGFuY2UsIHNldHVwUmVzdWx0OiBvYmplY3QpIHtcclxuICBpZiAodHlwZW9mIHNldHVwUmVzdWx0ID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICBpbnN0YW5jZS5zZXR1cFN0YXRlID0gc2V0dXBSZXN1bHRcclxuICB9XHJcblxyXG4gIGZpbmlzaENvbXBvbmVudFNldHVwKGluc3RhbmNlKVxyXG59XHJcblxyXG5mdW5jdGlvbiBmaW5pc2hDb21wb25lbnRTZXR1cChpbnN0YW5jZTogQ29tcG9uZW50SW5zdGFuY2UpIHtcclxuICBjb25zdCBDb21wb25lbnQgPSBpbnN0YW5jZS50eXBlIGFzIENvbXBvbmVudFxyXG4gIGlmIChjb21waWxlciAmJiAhQ29tcG9uZW50LnJlbmRlcikge1xyXG4gICAgaWYgKENvbXBvbmVudC50ZW1wbGF0ZSkge1xyXG4gICAgICBDb21wb25lbnQucmVuZGVyID0gY29tcGlsZXIoQ29tcG9uZW50LnRlbXBsYXRlKVxyXG4gICAgfVxyXG4gIH1cclxuICBpbnN0YW5jZS5yZW5kZXIgPSBDb21wb25lbnQucmVuZGVyXHJcbn1cclxuXHJcbmxldCBjdXJyZW50SW5zdGFuY2U6IG51bGwgfCBDb21wb25lbnRJbnN0YW5jZSA9IG51bGxcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRDdXJyZW50SW5zdGFuY2UoKSB7XHJcbiAgcmV0dXJuIGN1cnJlbnRJbnN0YW5jZVxyXG59XHJcblxyXG5mdW5jdGlvbiBzZXRDdXJyZW50SW5zdGFuY2UoaW5zdGFuY2U6IENvbXBvbmVudEluc3RhbmNlIHwgbnVsbCkge1xyXG4gIGN1cnJlbnRJbnN0YW5jZSA9IGluc3RhbmNlXHJcbn1cclxuXHJcbmxldCBjb21waWxlclxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyUnVudGltZUNvbXBpbGVyKF9jb21waWxlcikge1xyXG4gIGNvbXBpbGVyID0gX2NvbXBpbGVyXHJcbn1cclxuIiwiaW1wb3J0IHsgVk5vZGUgfSBmcm9tIFwiLi92bm9kZVwiXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkVXBkYXRlQ29tcG9uZW50KG5ld1ZOb2RlOiBWTm9kZSwgb2xkVk5vZGU6IFZOb2RlIHwgbnVsbCkge1xyXG4gIGNvbnN0IHsgcHJvcHM6IG9sZFByb3BzIH0gPSBvbGRWTm9kZSB8fCB7fVxyXG4gIGNvbnN0IHsgcHJvcHM6IG5ld1Byb3BzIH0gPSBuZXdWTm9kZVxyXG5cclxuICBmb3IgKGNvbnN0IGtleSBpbiBuZXdQcm9wcykge1xyXG4gICAgaWYgKG5ld1Byb3BzW2tleV0gIT09IG9sZFByb3BzPy5ba2V5XSkge1xyXG4gICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gZmFsc2VcclxufVxyXG4iLCJpbXBvcnQgeyBDb21wb25lbnRJbnN0YW5jZSB9IGZyb20gXCIuL2NvbXBvbmVudFwiXHJcbmltcG9ydCB7IENvbXBvbmVudCB9IGZyb20gXCIuL2hcIlxyXG5cclxuZXhwb3J0IGNvbnN0IFRleHQgPSBTeW1ib2woXCJUZXh0XCIpXHJcbmV4cG9ydCBpbnRlcmZhY2UgVk5vZGUge1xyXG4gIHR5cGU6IHN0cmluZyB8IENvbXBvbmVudCB8IFN5bWJvbFxyXG4gIHByb3BzOiBvYmplY3RcclxuICBjaGlsZHJlbjogVk5vZGVbXSB8IHN0cmluZ1xyXG4gIGNvbXBvbmVudD86IENvbXBvbmVudEluc3RhbmNlIHwgbnVsbFxyXG4gIGVsOiBFbGVtZW50IHwgbnVsbFxyXG4gIGtleT86IHN0cmluZ1xyXG59XHJcblxyXG5leHBvcnQgeyBjcmVhdGVWTm9kZSBhcyBjcmVhdGVFbGVtZW50Vk5vZGUgfVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVZOb2RlKFxyXG4gIHR5cGU6IHN0cmluZyB8IENvbXBvbmVudCB8IFN5bWJvbCxcclxuICBwcm9wcz86IGFueSxcclxuICBjaGlsZHJlbj86IFZOb2RlW10gfCBzdHJpbmdcclxuKTogVk5vZGUge1xyXG4gIGNvbnN0IHZub2RlOiBWTm9kZSA9IHtcclxuICAgIHR5cGUsXHJcbiAgICBwcm9wczogcHJvcHMgfHwge30sXHJcbiAgICBjaGlsZHJlbjogY2hpbGRyZW4gfHwgW10sXHJcbiAgICBjb21wb25lbnQ6IG51bGwsXHJcbiAgICBlbDogbnVsbCxcclxuICAgIGtleTogcHJvcHM/LmtleSxcclxuICB9XHJcblxyXG4gIHJldHVybiB2bm9kZVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGV4dFZOb2RlKGNvbnRlbnQ6IHN0cmluZykge1xyXG4gIHJldHVybiBjcmVhdGVWTm9kZShUZXh0LCB7fSwgY29udGVudClcclxufVxyXG4iLCJpbXBvcnQgeyBjb252ZXJ0U3RyaW5nVG9IVE1MRWxlbWVudCB9IGZyb20gXCJAbWluLXZ1ZS9zaGFyZWRcIlxyXG5pbXBvcnQgeyBDb21wb25lbnQgfSBmcm9tIFwiLi9oXCJcclxuaW1wb3J0IHsgY3JlYXRlVk5vZGUgfSBmcm9tIFwiLi92bm9kZVwiXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQXBwQVBJKHJlbmRlcikge1xyXG4gIHJldHVybiBmdW5jdGlvbiBjcmVhdGVBcHAocm9vdENvbXBvbmVudDogQ29tcG9uZW50KSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBtb3VudChfcm9vdENvbnRhaW5lcjogc3RyaW5nIHwgRWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IHZub2RlID0gY3JlYXRlVk5vZGUocm9vdENvbXBvbmVudClcclxuICAgICAgICBjb25zdCByb290Q29udGFpbmVyID0gY29udmVydFN0cmluZ1RvSFRNTEVsZW1lbnQoX3Jvb3RDb250YWluZXIpXHJcbiAgICAgICAgcmVuZGVyKHZub2RlLCByb290Q29udGFpbmVyKVxyXG4gICAgICB9LFxyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iLCJjb25zdCBxdWV1ZTogYW55W10gPSBbXVxyXG5cclxuY29uc3QgcCA9IFByb21pc2UucmVzb2x2ZSgpXHJcbmxldCBpc0ZsdXNoUGVuZGluZyA9IGZhbHNlXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcclxuICByZXR1cm4gZm4gPyBwLnRoZW4oZm4pIDogcFxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcXVldWVKb2JzKGpvYikge1xyXG4gIGlmICghcXVldWUuaW5jbHVkZXMoam9iKSkge1xyXG4gICAgcXVldWUucHVzaChqb2IpXHJcbiAgfVxyXG5cclxuICBxdWV1ZUZsdXNoKClcclxufVxyXG5cclxuZnVuY3Rpb24gcXVldWVGbHVzaCgpIHtcclxuICBpZiAoaXNGbHVzaFBlbmRpbmcpIHJldHVyblxyXG4gIGlzRmx1c2hQZW5kaW5nID0gdHJ1ZVxyXG5cclxuICBuZXh0VGljayhmbHVzaEpvYnMpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZsdXNoSm9icygpIHtcclxuICBsZXQgam9iXHJcbiAgaXNGbHVzaFBlbmRpbmcgPSBmYWxzZVxyXG4gIHdoaWxlICgoam9iID0gcXVldWUuc2hpZnQoKSkpIHtcclxuICAgIGpvYiAmJiBqb2IoKVxyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgeyBlZmZlY3QgfSBmcm9tIFwiQG1pbi12dWUvcmVhY3Rpdml0eS9zcmMvZWZmZWN0XCJcclxuaW1wb3J0IHsgaXNBcnJheSwgaXNPYmplY3QsIGlzU3RyaW5nIH0gZnJvbSBcIkBtaW4tdnVlL3NoYXJlZFwiXHJcbmltcG9ydCB7XHJcbiAgQ29tcG9uZW50SW5zdGFuY2UsXHJcbiAgY3JlYXRlQ29tcG9uZW50SW5zdGFuY2UsXHJcbiAgc2V0dXBDb21wb25lbnQsXHJcbn0gZnJvbSBcIi4vY29tcG9uZW50XCJcclxuaW1wb3J0IHsgc2hvdWxkVXBkYXRlQ29tcG9uZW50IH0gZnJvbSBcIi4vY29tcG9uZW50VXBkYXRlVXRpbHNcIlxyXG5pbXBvcnQgeyBjcmVhdGVBcHBBUEkgfSBmcm9tIFwiLi9jcmVhdGVBcHBcIlxyXG5pbXBvcnQgeyBxdWV1ZUpvYnMgfSBmcm9tIFwiLi9zY2hlZHVsZXJcIlxyXG5pbXBvcnQgeyBUZXh0LCBWTm9kZSB9IGZyb20gXCIuL3Zub2RlXCJcclxuXHJcbmV4cG9ydCBjb25zdCBGcmFnbWVudCA9IFN5bWJvbChcIkZyYWdtZW50XCIpXHJcblxyXG5pbnRlcmZhY2UgT3B0aW9ucyB7XHJcbiAgY3JlYXRlRWxlbWVudDogKHR5cGU6IHN0cmluZykgPT4gYW55XHJcbiAgcGF0Y2hQcm9wOiAoZWw6IGFueSwga2V5OiBzdHJpbmcsIG9sZFZhbHVlOiBhbnksIG5ld1ZhbHVlOiBhbnkpID0+IHZvaWRcclxuICBpbnNlcnQ6IChlbDogYW55LCBjb250YWluZXI6IGFueSwgYW5jaG9yOiBhbnkpID0+IHZvaWRcclxuICBjcmVhdGVUZXh0Tm9kZTogKGNvbnRlbnQ6IHN0cmluZykgPT4gYW55XHJcbiAgcmVtb3ZlOiAoY2hpbGQ6IGFueSkgPT4gYW55XHJcbiAgc2V0RWxlbWVudFRleHQ6IChlbCwgdGV4dCkgPT4gYW55XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSZW5kZXJlcihvcHRpb25zOiBPcHRpb25zKSB7XHJcbiAgY29uc3Qge1xyXG4gICAgY3JlYXRlRWxlbWVudDogaG9zdENyZWF0ZUVsZW1lbnQsXHJcbiAgICBwYXRjaFByb3A6IGhvc3RQYXRjaFByb3AsXHJcbiAgICBpbnNlcnQ6IGhvc3RJbnNlcnQsXHJcbiAgICBjcmVhdGVUZXh0Tm9kZTogaG9zdENyZWF0ZVRleHROb2RlLFxyXG4gICAgcmVtb3ZlOiBob3N0UmVtb3ZlLFxyXG4gICAgc2V0RWxlbWVudFRleHQ6IGhvc3RTZXRFbGVtZW50VGV4dCxcclxuICB9ID0gb3B0aW9uc1xyXG5cclxuICBmdW5jdGlvbiByZW5kZXIodm5vZGU6IFZOb2RlLCBjb250YWluZXI6IEVsZW1lbnQpIHtcclxuICAgIHBhdGNoKHZub2RlLCBudWxsLCBjb250YWluZXIsIHVuZGVmaW5lZCwgbnVsbCBhcyBhbnkpXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXRjaChcclxuICAgIG5ld1ZOb2RlOiBWTm9kZSxcclxuICAgIHByZVZOb2RlOiBWTm9kZSB8IG51bGwsXHJcbiAgICBjb250YWluZXI6IEVsZW1lbnQsXHJcbiAgICBwYXJlbnRDb21wb25lbnQ/OiBDb21wb25lbnRJbnN0YW5jZSxcclxuICAgIGFuY2hvcj86IEVsZW1lbnRcclxuICApIHtcclxuICAgIHN3aXRjaCAobmV3Vk5vZGUudHlwZSkge1xyXG4gICAgICBjYXNlIEZyYWdtZW50OlxyXG4gICAgICAgIHByb2Nlc3NGcmFnbWVudChuZXdWTm9kZSwgcHJlVk5vZGUsIGNvbnRhaW5lciwgcGFyZW50Q29tcG9uZW50KVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgVGV4dDpcclxuICAgICAgICBwcm9jZXNzVGV4dChuZXdWTm9kZSwgcHJlVk5vZGUsIGNvbnRhaW5lciwgYW5jaG9yKVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgaWYgKHR5cGVvZiBuZXdWTm9kZS50eXBlID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgICAgICAvLyDlpITnkIbnu4Tku7ZcclxuICAgICAgICAgIHByb2Nlc3NFbGVtZW50KG5ld1ZOb2RlLCBwcmVWTm9kZSwgY29udGFpbmVyLCBwYXJlbnRDb21wb25lbnQsIGFuY2hvcilcclxuICAgICAgICB9IGVsc2UgaWYgKGlzT2JqZWN0KG5ld1ZOb2RlLnR5cGUpKSB7XHJcbiAgICAgICAgICBwcm9jZXNzQ29tcG9uZW50KG5ld1ZOb2RlLCBwcmVWTm9kZSwgY29udGFpbmVyLCBwYXJlbnRDb21wb25lbnQpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICB9XHJcbiAgfVxyXG4gIGZ1bmN0aW9uIHByb2Nlc3NUZXh0KFxyXG4gICAgbmV3Vk5vZGU6IFZOb2RlLFxyXG4gICAgcHJlVk5vZGU6IFZOb2RlIHwgbnVsbCxcclxuICAgIGNvbnRhaW5lcjogRWxlbWVudCxcclxuICAgIGFuY2hvcj86IEVsZW1lbnRcclxuICApIHtcclxuICAgIGNvbnN0IHsgY2hpbGRyZW4gfSA9IG5ld1ZOb2RlXHJcbiAgICBjb25zdCB0ZXh0Tm9kZSA9IChuZXdWTm9kZS5lbCA9IGhvc3RDcmVhdGVUZXh0Tm9kZShcclxuICAgICAgY2hpbGRyZW4gYXMgc3RyaW5nXHJcbiAgICApIGFzIGFueSlcclxuICAgIGhvc3RJbnNlcnQodGV4dE5vZGUsIGNvbnRhaW5lciwgYW5jaG9yKVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcHJvY2Vzc0ZyYWdtZW50KFxyXG4gICAgbmV3Vk5vZGU6IFZOb2RlLFxyXG4gICAgcHJlVk5vZGU6IFZOb2RlIHwgbnVsbCxcclxuICAgIGNvbnRhaW5lcjogRWxlbWVudCxcclxuICAgIHBhcmVudENvbXBvbmVudD86IENvbXBvbmVudEluc3RhbmNlLFxyXG4gICAgYW5jaG9yPzogRWxlbWVudFxyXG4gICkge1xyXG4gICAgaWYgKHR5cGVvZiBuZXdWTm9kZS5jaGlsZHJlbiA9PT0gXCJzdHJpbmdcIikgcmV0dXJuXHJcbiAgICBuZXdWTm9kZS5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZCkgPT5cclxuICAgICAgcGF0Y2goY2hpbGQsIG51bGwsIGNvbnRhaW5lciwgcGFyZW50Q29tcG9uZW50LCBhbmNob3IpXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwcm9jZXNzRWxlbWVudChcclxuICAgIG5ld1ZOb2RlOiBWTm9kZSxcclxuICAgIHByZVZOb2RlOiBWTm9kZSB8IG51bGwsXHJcbiAgICBjb250YWluZXI6IEVsZW1lbnQsXHJcbiAgICBwYXJlbnRDb21wb25lbnQ/OiBDb21wb25lbnRJbnN0YW5jZSxcclxuICAgIGFuY2hvcj86IEVsZW1lbnRcclxuICApIHtcclxuICAgIGlmICghcHJlVk5vZGUpIHtcclxuICAgICAgbW91bnRFbGVtZW50KG5ld1ZOb2RlLCBjb250YWluZXIsIHBhcmVudENvbXBvbmVudCwgYW5jaG9yKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcGF0Y2hFbGVtZW50KG5ld1ZOb2RlLCBwcmVWTm9kZSwgcGFyZW50Q29tcG9uZW50LCBhbmNob3IpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXRjaEVsZW1lbnQoXHJcbiAgICBuZXdWTm9kZTogVk5vZGUsXHJcbiAgICBwcmVWTm9kZTogVk5vZGUsXHJcbiAgICBwYXJlbnRDb21wb25lbnQ/OiBDb21wb25lbnRJbnN0YW5jZSxcclxuICAgIGFuY2hvcj86IEVsZW1lbnRcclxuICApIHtcclxuICAgIGNvbnN0IG9sZFByb3BzID0gcHJlVk5vZGUucHJvcHMgfHwgRU1QVFlfT0JKXHJcbiAgICBjb25zdCBuZXdQcm9wcyA9IG5ld1ZOb2RlLnByb3BzIHx8IEVNUFRZX09CSlxyXG5cclxuICAgIGNvbnN0IGVsID0gKG5ld1ZOb2RlLmVsID0gcHJlVk5vZGUuZWwpIGFzIEVsZW1lbnRcclxuICAgIHBhdGNoQ2hpbGRyZW4ocHJlVk5vZGUsIG5ld1ZOb2RlLCBlbCwgcGFyZW50Q29tcG9uZW50LCBhbmNob3IpXHJcbiAgICBwYXRjaFByb3BzKGVsLCBvbGRQcm9wcywgbmV3UHJvcHMpXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXRjaENoaWxkcmVuKFxyXG4gICAgcHJlVk5vZGU6IFZOb2RlLFxyXG4gICAgbmV3Vk5vZGU6IFZOb2RlLFxyXG4gICAgZWw6IEVsZW1lbnQsXHJcbiAgICBwYXJlbnRDb21wb25lbnQ/OiBDb21wb25lbnRJbnN0YW5jZSxcclxuICAgIGFuY2hvcj86IEVsZW1lbnRcclxuICApIHtcclxuICAgIGNvbnN0IG5ld0NoaWxkcmVuID0gbmV3Vk5vZGUuY2hpbGRyZW5cclxuICAgIGNvbnN0IHByZUNoaWxkcmVuID0gcHJlVk5vZGUuY2hpbGRyZW5cclxuXHJcbiAgICAvLyDmlrBjaGlsZHJlbuaYr+aWh+acrFxyXG4gICAgaWYgKGlzU3RyaW5nKG5ld0NoaWxkcmVuKSkge1xyXG4gICAgICBpZiAoaXNBcnJheShwcmVDaGlsZHJlbikpIHtcclxuICAgICAgICAvLyDmiorogIFjaGlsZHJlbua4heepulxyXG4gICAgICAgIHVubW91bnRDaGlsZHJlbihwcmVDaGlsZHJlbiBhcyBWTm9kZVtdKVxyXG4gICAgICB9XHJcbiAgICAgIGlmIChuZXdDaGlsZHJlbiAhPT0gcHJlQ2hpbGRyZW4pIHtcclxuICAgICAgICAvLyDmm7TmlrB0ZXh0XHJcbiAgICAgICAgaG9zdFNldEVsZW1lbnRUZXh0KGVsLCBuZXdDaGlsZHJlbilcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChpc0FycmF5KG5ld0NoaWxkcmVuKSkge1xyXG4gICAgICBpZiAoaXNTdHJpbmcocHJlQ2hpbGRyZW4pKSB7XHJcbiAgICAgICAgaG9zdFNldEVsZW1lbnRUZXh0KGVsLCBcIlwiKVxyXG4gICAgICAgIG1vdW50Q2hpbGRyZW4obmV3Q2hpbGRyZW4gYXMgVk5vZGVbXSwgZWwsIHBhcmVudENvbXBvbmVudCwgYW5jaG9yKVxyXG4gICAgICB9IGVsc2UgaWYgKGlzQXJyYXkocHJlQ2hpbGRyZW4pKSB7XHJcbiAgICAgICAgLy8gZGlmZiBhcnJheVxyXG4gICAgICAgIHBhdGNoS2V5ZWRDaGlsZHJlbihcclxuICAgICAgICAgIG5ld0NoaWxkcmVuIGFzIFZOb2RlW10sXHJcbiAgICAgICAgICBwcmVDaGlsZHJlbiBhcyBWTm9kZVtdLFxyXG4gICAgICAgICAgZWwsXHJcbiAgICAgICAgICBwYXJlbnRDb21wb25lbnQsXHJcbiAgICAgICAgICBhbmNob3JcclxuICAgICAgICApXHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGlzU2FtZUtleU5vZGUobjE6IFZOb2RlLCBuMjogVk5vZGUpIHtcclxuICAgIHJldHVybiBuMS5rZXkgPT09IG4yLmtleSAmJiBuMS50eXBlID09PSBuMi50eXBlXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXRjaEtleWVkQ2hpbGRyZW4oXHJcbiAgICBuZXdDaGlsZHJlbjogVk5vZGVbXSxcclxuICAgIHByZUNoaWxkcmVuOiBWTm9kZVtdLFxyXG4gICAgZWw6IEVsZW1lbnQsXHJcbiAgICBwYXJlbnRDb21wb25lbnQsXHJcbiAgICBwYXJlbnRBbmNob3I/OiBFbGVtZW50XHJcbiAgKSB7XHJcbiAgICAvLyDlm5vkuKrntKLlvJXlgLxcclxuICAgIGxldCBwcmVTdGFydEluZGV4ID0gMFxyXG4gICAgbGV0IHByZUVuZEluZGV4ID0gcHJlQ2hpbGRyZW4ubGVuZ3RoIC0gMVxyXG4gICAgbGV0IG5ld1N0YXJ0SW5kZXggPSAwXHJcbiAgICBsZXQgbmV3RW5kSW5kZXggPSBuZXdDaGlsZHJlbi5sZW5ndGggLSAxXHJcbiAgICAvLyDlm5vkuKrntKLlvJXmjIflkJHnmoR2bm9kZeiKgueCuVxyXG4gICAgbGV0IHByZVN0YXJ0Vk5vZGUgPSBwcmVDaGlsZHJlbltwcmVTdGFydEluZGV4XVxyXG4gICAgbGV0IHByZUVuZFZOb2RlID0gcHJlQ2hpbGRyZW5bcHJlRW5kSW5kZXhdXHJcbiAgICBsZXQgbmV3U3RhcnRWTm9kZSA9IG5ld0NoaWxkcmVuW25ld1N0YXJ0SW5kZXhdXHJcbiAgICBsZXQgbmV3RW5kVk5vZGUgPSBuZXdDaGlsZHJlbltuZXdFbmRJbmRleF1cclxuXHJcbiAgICB3aGlsZSAocHJlU3RhcnRJbmRleCA8PSBwcmVFbmRJbmRleCAmJiBuZXdTdGFydEluZGV4IDw9IG5ld0VuZEluZGV4KSB7XHJcbiAgICAgIGlmICghcHJlU3RhcnRWTm9kZSkge1xyXG4gICAgICAgIHByZVN0YXJ0Vk5vZGUgPSBwcmVDaGlsZHJlblsrK3ByZVN0YXJ0SW5kZXhdXHJcbiAgICAgIH0gZWxzZSBpZiAoIXByZUVuZFZOb2RlKSB7XHJcbiAgICAgICAgcHJlRW5kVk5vZGUgPSBwcmVDaGlsZHJlblstLXByZUVuZEluZGV4XVxyXG4gICAgICB9IGVsc2UgaWYgKGlzU2FtZUtleU5vZGUocHJlU3RhcnRWTm9kZSwgbmV3U3RhcnRWTm9kZSkpIHtcclxuICAgICAgICBwYXRjaChuZXdTdGFydFZOb2RlLCBwcmVTdGFydFZOb2RlLCBlbCwgcGFyZW50Q29tcG9uZW50LCBwYXJlbnRBbmNob3IpXHJcbiAgICAgICAgcHJlU3RhcnRWTm9kZSA9IHByZUNoaWxkcmVuWysrcHJlU3RhcnRJbmRleF1cclxuICAgICAgICBuZXdTdGFydFZOb2RlID0gbmV3Q2hpbGRyZW5bKytuZXdTdGFydEluZGV4XVxyXG4gICAgICB9IGVsc2UgaWYgKGlzU2FtZUtleU5vZGUocHJlRW5kVk5vZGUsIG5ld0VuZFZOb2RlKSkge1xyXG4gICAgICAgIHBhdGNoKG5ld0VuZFZOb2RlLCBwcmVFbmRWTm9kZSwgZWwsIHBhcmVudENvbXBvbmVudCwgcGFyZW50QW5jaG9yKVxyXG4gICAgICAgIHByZUVuZFZOb2RlID0gcHJlQ2hpbGRyZW5bLS1wcmVFbmRJbmRleF1cclxuICAgICAgICBuZXdFbmRWTm9kZSA9IG5ld0NoaWxkcmVuWy0tbmV3RW5kSW5kZXhdXHJcbiAgICAgIH0gZWxzZSBpZiAocHJlU3RhcnRWTm9kZS5rZXkgPT09IG5ld0VuZFZOb2RlLmtleSkge1xyXG4gICAgICAgIHBhdGNoKG5ld0VuZFZOb2RlLCBwcmVTdGFydFZOb2RlLCBlbCwgcGFyZW50Q29tcG9uZW50LCBwYXJlbnRBbmNob3IpXHJcbiAgICAgICAgaG9zdEluc2VydChwcmVTdGFydFZOb2RlLmVsLCBlbCwgcHJlRW5kVk5vZGUuZWw/Lm5leHRTaWJsaW5nKVxyXG4gICAgICAgIHByZVN0YXJ0Vk5vZGUgPSBwcmVDaGlsZHJlblsrK3ByZVN0YXJ0SW5kZXhdXHJcbiAgICAgICAgbmV3RW5kVk5vZGUgPSBuZXdDaGlsZHJlblstLW5ld0VuZEluZGV4XVxyXG4gICAgICB9IGVsc2UgaWYgKHByZUVuZFZOb2RlLmtleSA9PT0gbmV3U3RhcnRWTm9kZS5rZXkpIHtcclxuICAgICAgICBwYXRjaChuZXdTdGFydFZOb2RlLCBwcmVFbmRWTm9kZSwgZWwsIHBhcmVudENvbXBvbmVudCwgcGFyZW50QW5jaG9yKVxyXG4gICAgICAgIGhvc3RJbnNlcnQocHJlRW5kVk5vZGUuZWwsIGVsLCBwcmVTdGFydFZOb2RlLmVsKVxyXG4gICAgICAgIHByZUVuZFZOb2RlID0gcHJlQ2hpbGRyZW5bLS1wcmVFbmRJbmRleF1cclxuICAgICAgICBuZXdTdGFydFZOb2RlID0gbmV3Q2hpbGRyZW5bKytuZXdTdGFydEluZGV4XVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIOWkhOeQhumdnueQhuaAp+eahOaDheWGtVxyXG4gICAgICAgIGNvbnN0IGluZGV4SW5QcmUgPSBwcmVDaGlsZHJlbi5maW5kSW5kZXgoXHJcbiAgICAgICAgICAobm9kZSkgPT4gbm9kZS5rZXkgPT09IG5ld1N0YXJ0Vk5vZGUua2V5XHJcbiAgICAgICAgKVxyXG5cclxuICAgICAgICBpZiAoaW5kZXhJblByZSA+IDApIHtcclxuICAgICAgICAgIC8vIOiDveWcqHByZUNoaWxkcmVu5Lit5om+5YiwbmV3U3RhclZOb2Rl77yM6K+05piO5Y+v5Lul5aSN55So77yM56e75Yqo5pen6IqC54K5XHJcbiAgICAgICAgICBjb25zdCB2bm9kZVRvTW92ZSA9IHByZUNoaWxkcmVuW2luZGV4SW5QcmVdXHJcbiAgICAgICAgICBwYXRjaChuZXdTdGFydFZOb2RlLCB2bm9kZVRvTW92ZSwgZWwsIHBhcmVudENvbXBvbmVudCwgcGFyZW50QW5jaG9yKVxyXG4gICAgICAgICAgaG9zdEluc2VydCh2bm9kZVRvTW92ZS5lbCwgZWwsIHByZVN0YXJ0Vk5vZGUuZWwpXHJcbiAgICAgICAgICA7KHByZUNoaWxkcmVuIGFzIGFueSlbaW5kZXhJblByZV0gPSB1bmRlZmluZWRcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgLy8g5om+5LiN5Yiw77yM6K+05piO5piv5paw55qE6IqC54K577yM6L+b6KGM5oyC6L29XHJcbiAgICAgICAgICBwYXRjaChcclxuICAgICAgICAgICAgbmV3U3RhcnRWTm9kZSxcclxuICAgICAgICAgICAgbnVsbCxcclxuICAgICAgICAgICAgZWwsXHJcbiAgICAgICAgICAgIHBhcmVudENvbXBvbmVudCxcclxuICAgICAgICAgICAgcHJlU3RhcnRWTm9kZS5lbCBhcyBFbGVtZW50XHJcbiAgICAgICAgICApXHJcbiAgICAgICAgfVxyXG4gICAgICAgIG5ld1N0YXJ0Vk5vZGUgPSBuZXdDaGlsZHJlblsrK25ld1N0YXJ0SW5kZXhdXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyDmo4Dmn6XmmK/lkKbov5jmnInpgZfnlZnnmoToioLngrlcclxuICAgIGlmIChwcmVFbmRJbmRleCA8IHByZVN0YXJ0SW5kZXggJiYgbmV3U3RhcnRJbmRleCA8PSBuZXdFbmRJbmRleCkge1xyXG4gICAgICAvLyDmnInmlrDlop7nmoToioLngrnopoHlpITnkIZcclxuICAgICAgZm9yIChsZXQgaSA9IG5ld1N0YXJ0SW5kZXg7IGkgPD0gbmV3RW5kSW5kZXg7IGkrKykge1xyXG4gICAgICAgIHBhdGNoKFxyXG4gICAgICAgICAgbmV3Q2hpbGRyZW5baV0sXHJcbiAgICAgICAgICBudWxsLFxyXG4gICAgICAgICAgZWwsXHJcbiAgICAgICAgICBwYXJlbnRDb21wb25lbnQsXHJcbiAgICAgICAgICBwcmVTdGFydFZOb2RlLmVsIGFzIEVsZW1lbnRcclxuICAgICAgICApXHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAobmV3RW5kSW5kZXggPCBuZXdTdGFydEluZGV4ICYmIHByZVN0YXJ0SW5kZXggPD0gcHJlRW5kSW5kZXgpIHtcclxuICAgICAgLy8g5pyJ5Y246L2955qE6IqC54K56KaB5aSE55CGXHJcbiAgICAgIGNvbnN0IGNoaWxkV2lsbFVubW91bnRMaXN0OiBWTm9kZVtdID0gW11cclxuICAgICAgZm9yIChsZXQgaSA9IHByZVN0YXJ0SW5kZXg7IGkgPD0gcHJlRW5kSW5kZXg7IGkrKykge1xyXG4gICAgICAgIGNoaWxkV2lsbFVubW91bnRMaXN0LnB1c2gocHJlQ2hpbGRyZW5baV0pXHJcbiAgICAgIH1cclxuICAgICAgdW5tb3VudENoaWxkcmVuKGNoaWxkV2lsbFVubW91bnRMaXN0KVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gdW5tb3VudENoaWxkcmVuKGNoaWxkcmVuOiBWTm9kZVtdKSB7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IGVsID0gY2hpbGRyZW5baV0uZWxcclxuICAgICAgaG9zdFJlbW92ZShlbClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGNvbnN0IEVNUFRZX09CSiA9IHt9XHJcbiAgZnVuY3Rpb24gcGF0Y2hQcm9wcyhlbDogRWxlbWVudCwgb2xkUHJvcHMsIG5ld1Byb3BzKSB7XHJcbiAgICBpZiAob2xkUHJvcHMgPT09IG5ld1Byb3BzKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gICAgZm9yIChjb25zdCBrZXkgaW4gbmV3UHJvcHMpIHtcclxuICAgICAgY29uc3QgcHJlUHJvcCA9IG9sZFByb3BzW2tleV1cclxuICAgICAgY29uc3QgbmV4dFByb3AgPSBuZXdQcm9wc1trZXldXHJcblxyXG4gICAgICBpZiAocHJlUHJvcCAhPT0gbmV4dFByb3ApIHtcclxuICAgICAgICBob3N0UGF0Y2hQcm9wKGVsLCBrZXksIHByZVByb3AsIG5leHRQcm9wKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAob2xkUHJvcHMgPT09IEVNUFRZX09CSikge1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIC8vIOenu+mZpOS4jeWtmOWcqOeahHByb3BzXHJcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvbGRQcm9wcykge1xyXG4gICAgICBpZiAoIShrZXkgaW4gbmV3UHJvcHMpKSB7XHJcbiAgICAgICAgaG9zdFBhdGNoUHJvcChlbCwga2V5LCBvbGRQcm9wc1trZXldLCBudWxsKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBtb3VudEVsZW1lbnQoXHJcbiAgICBpbml0aWFsVm5vZGU6IFZOb2RlLFxyXG4gICAgY29udGFpbmVyOiBFbGVtZW50LFxyXG4gICAgcGFyZW50Q29tcG9uZW50PzogQ29tcG9uZW50SW5zdGFuY2UsXHJcbiAgICBhbmNob3I/OiBFbGVtZW50XHJcbiAgKSB7XHJcbiAgICBjb25zdCBlbCA9IChpbml0aWFsVm5vZGUuZWwgPSBob3N0Q3JlYXRlRWxlbWVudChcclxuICAgICAgaW5pdGlhbFZub2RlLnR5cGUgYXMgc3RyaW5nXHJcbiAgICApKVxyXG4gICAgY29uc3QgeyBjaGlsZHJlbiwgcHJvcHMgfSA9IGluaXRpYWxWbm9kZVxyXG5cclxuICAgIC8vIOWkhOeQhnByb3BzXHJcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBwcm9wcykge1xyXG4gICAgICBjb25zdCB2YWx1ZSA9IHByb3BzW2tleV1cclxuICAgICAgaG9zdFBhdGNoUHJvcChlbCwga2V5LCBudWxsLCB2YWx1ZSlcclxuICAgIH1cclxuICAgIC8vIOWkhOeQhmNoaWxkcmVuXHJcbiAgICBpZiAodHlwZW9mIGNoaWxkcmVuID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgIGVsLnRleHRDb250ZW50ID0gY2hpbGRyZW4gYXMgc3RyaW5nXHJcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoY2hpbGRyZW4pKSB7XHJcbiAgICAgIG1vdW50Q2hpbGRyZW4oY2hpbGRyZW4sIGVsLCBwYXJlbnRDb21wb25lbnQsIGFuY2hvcilcclxuICAgIH1cclxuICAgIC8vIOaMgui9vVxyXG4gICAgaG9zdEluc2VydChlbCwgY29udGFpbmVyLCBhbmNob3IpXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBtb3VudENoaWxkcmVuKFxyXG4gICAgY2hpbGRyZW46IFZOb2RlW10sXHJcbiAgICBlbDogRWxlbWVudCxcclxuICAgIHBhcmVudENvbXBvbmVudD86IENvbXBvbmVudEluc3RhbmNlLFxyXG4gICAgYW5jaG9yPzogRWxlbWVudFxyXG4gICkge1xyXG4gICAgY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQpID0+IHtcclxuICAgICAgcGF0Y2goY2hpbGQsIG51bGwsIGVsLCBwYXJlbnRDb21wb25lbnQsIGFuY2hvcilcclxuICAgIH0pXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwcm9jZXNzQ29tcG9uZW50KFxyXG4gICAgbmV3Vk5vZGU6IFZOb2RlLFxyXG4gICAgb2xkVk5vZGU6IFZOb2RlIHwgbnVsbCxcclxuICAgIGNvbnRhaW5lcjogRWxlbWVudCxcclxuICAgIHBhcmVudENvbXBvbmVudD86IENvbXBvbmVudEluc3RhbmNlLFxyXG4gICAgYW5jaG9yPzogRWxlbWVudFxyXG4gICkge1xyXG4gICAgaWYgKCFvbGRWTm9kZSkge1xyXG4gICAgICBtb3VudENvbXBvbmVudChuZXdWTm9kZSwgY29udGFpbmVyLCBwYXJlbnRDb21wb25lbnQsIGFuY2hvcilcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHVwZGF0ZUNvbXBvbmVudChuZXdWTm9kZSwgb2xkVk5vZGUpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiB1cGRhdGVDb21wb25lbnQobmV3Vk5vZGU6IFZOb2RlLCBvbGRWTm9kZTogVk5vZGUgfCBudWxsKSB7XHJcbiAgICBjb25zdCBpbnN0YW5jZSA9IG9sZFZOb2RlPy5jb21wb25lbnQgYXMgQ29tcG9uZW50SW5zdGFuY2VcclxuICAgIGlmIChzaG91bGRVcGRhdGVDb21wb25lbnQobmV3Vk5vZGUsIG9sZFZOb2RlKSkge1xyXG4gICAgICBuZXdWTm9kZS5jb21wb25lbnQgPSBpbnN0YW5jZVxyXG4gICAgICBpbnN0YW5jZS5uZXh0ID0gbmV3Vk5vZGVcclxuICAgICAgaW5zdGFuY2UudXBkYXRlPy4oKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8g5LiN5pu05paw5bCx6KaB6YeN572uXHJcbiAgICAgIG5ld1ZOb2RlLmNvbXBvbmVudCA9IG9sZFZOb2RlPy5jb21wb25lbnRcclxuICAgICAgbmV3Vk5vZGUuZWwgPSBvbGRWTm9kZT8uZWwgYXMgRWxlbWVudFxyXG4gICAgICBpbnN0YW5jZS52bm9kZSA9IG5ld1ZOb2RlXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBtb3VudENvbXBvbmVudChcclxuICAgIHZub2RlOiBWTm9kZSxcclxuICAgIGNvbnRhaW5lcjogRWxlbWVudCxcclxuICAgIHBhcmVudENvbXBvbmVudD86IENvbXBvbmVudEluc3RhbmNlLFxyXG4gICAgYW5jaG9yPzogRWxlbWVudFxyXG4gICkge1xyXG4gICAgY29uc3QgaW5zdGFuY2UgPSBjcmVhdGVDb21wb25lbnRJbnN0YW5jZSh2bm9kZSwgcGFyZW50Q29tcG9uZW50KVxyXG4gICAgdm5vZGUuY29tcG9uZW50ID0gaW5zdGFuY2VcclxuXHJcbiAgICBzZXR1cENvbXBvbmVudChpbnN0YW5jZSlcclxuICAgIHNldHVwUmVuZGVyRWZmZWN0KGluc3RhbmNlLCB2bm9kZSwgY29udGFpbmVyLCBhbmNob3IpXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBzZXR1cFJlbmRlckVmZmVjdChcclxuICAgIGluc3RhbmNlOiBDb21wb25lbnRJbnN0YW5jZSxcclxuICAgIHZub2RlOiBWTm9kZSxcclxuICAgIGNvbnRhaW5lcjogRWxlbWVudCxcclxuICAgIGFuY2hvcj86IEVsZW1lbnRcclxuICApIHtcclxuICAgIGluc3RhbmNlLnVwZGF0ZSA9IGVmZmVjdChcclxuICAgICAgKCkgPT4ge1xyXG4gICAgICAgIGlmICghaW5zdGFuY2UuaXNNb3VudGVkKSB7XHJcbiAgICAgICAgICAvLyDmjILovb1cclxuICAgICAgICAgIGNvbnN0IHsgcHJveHkgfSA9IGluc3RhbmNlXHJcbiAgICAgICAgICBjb25zdCBzdWJUcmVlID0gKGluc3RhbmNlLnN1YlRyZWUgPSBpbnN0YW5jZS5yZW5kZXIhLmNhbGwoXHJcbiAgICAgICAgICAgIHByb3h5LFxyXG4gICAgICAgICAgICBwcm94eVxyXG4gICAgICAgICAgKSlcclxuXHJcbiAgICAgICAgICBwYXRjaChzdWJUcmVlLCBudWxsLCBjb250YWluZXIsIGluc3RhbmNlLCBhbmNob3IpXHJcbiAgICAgICAgICAvLyDmiYDmnInnmoRlbGVtZW506YO95bey57uP5aSE55CG5a6MXHJcbiAgICAgICAgICB2bm9kZS5lbCA9IHN1YlRyZWUuZWxcclxuICAgICAgICAgIGluc3RhbmNlLmlzTW91bnRlZCA9IHRydWVcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgLy8g5pu05pawXHJcbiAgICAgICAgICAvLyDmm7TmlrBwcm9wc1xyXG4gICAgICAgICAgY29uc3QgeyBuZXh0OiBuZXdWTm9kZSwgdm5vZGU6IHByZVZOb2RlIH0gPSBpbnN0YW5jZVxyXG4gICAgICAgICAgaWYgKG5ld1ZOb2RlKSB7XHJcbiAgICAgICAgICAgIG5ld1ZOb2RlLmVsID0gcHJlVk5vZGUuZWxcclxuICAgICAgICAgICAgdXBkYXRlQ29tcG9uZW50UHJlUmVuZGVyKGluc3RhbmNlLCBuZXdWTm9kZSlcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBjb25zdCB7IHByb3h5IH0gPSBpbnN0YW5jZVxyXG4gICAgICAgICAgY29uc3Qgc3ViVHJlZSA9IGluc3RhbmNlLnJlbmRlciEuY2FsbChwcm94eSwgcHJveHkpXHJcbiAgICAgICAgICBjb25zdCBwcmVTdWJUcmVlID0gaW5zdGFuY2Uuc3ViVHJlZVxyXG4gICAgICAgICAgaW5zdGFuY2Uuc3ViVHJlZSA9IHN1YlRyZWVcclxuXHJcbiAgICAgICAgICBwYXRjaChzdWJUcmVlLCBwcmVTdWJUcmVlLCBjb250YWluZXIsIGluc3RhbmNlLCBhbmNob3IpXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICB7XHJcbiAgICAgICAgc2NoZWR1bGVyOiAoKSA9PiB7XHJcbiAgICAgICAgICBxdWV1ZUpvYnMoaW5zdGFuY2UudXBkYXRlKVxyXG4gICAgICAgIH0sXHJcbiAgICAgIH1cclxuICAgIClcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHVwZGF0ZUNvbXBvbmVudFByZVJlbmRlcihcclxuICAgIGluc3RhbmNlOiBDb21wb25lbnRJbnN0YW5jZSxcclxuICAgIG5ld1ZOb2RlOiBWTm9kZVxyXG4gICkge1xyXG4gICAgaW5zdGFuY2Uudm5vZGUgPSBuZXdWTm9kZVxyXG4gICAgaW5zdGFuY2UubmV4dCA9IHVuZGVmaW5lZFxyXG4gICAgaW5zdGFuY2UucHJvcHMgPSBuZXdWTm9kZS5wcm9wc1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGNyZWF0ZUFwcDogY3JlYXRlQXBwQVBJKHJlbmRlciksXHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSBcIi4vcmVuZGVyZXJcIlxyXG5pbXBvcnQgeyBjcmVhdGVWTm9kZSB9IGZyb20gXCIuL3Zub2RlXCJcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJTbG90cyhzbG90cywgbmFtZSwgcHJvcHMpIHtcclxuICBjb25zdCBzbG90ID0gc2xvdHNbbmFtZV1cclxuICBpZiAoc2xvdCkge1xyXG4gICAgbGV0IHJlbmRlclNsb3QgPSBzbG90XHJcbiAgICBpZiAodHlwZW9mIHNsb3QgPT09IFwiZnVuY3Rpb25cIikge1xyXG4gICAgICByZW5kZXJTbG90ID0gc2xvdChwcm9wcylcclxuICAgICAgcmVuZGVyU2xvdCA9IEFycmF5LmlzQXJyYXkocmVuZGVyU2xvdCkgPyByZW5kZXJTbG90IDogW3JlbmRlclNsb3RdXHJcbiAgICB9XHJcbiAgICByZXR1cm4gY3JlYXRlVk5vZGUoRnJhZ21lbnQsIHt9LCByZW5kZXJTbG90KVxyXG4gIH1cclxuICByZXR1cm4ge31cclxufVxyXG4iLCJpbXBvcnQgeyBjcmVhdGVWTm9kZSwgVk5vZGUgfSBmcm9tIFwiLi92bm9kZVwiXHJcblxyXG50eXBlIENoaWxkcmVuID0gc3RyaW5nIHwgVk5vZGVbXSB8IFZOb2RlXHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIENvbXBvbmVudCB7XHJcbiAgcmVuZGVyOiAoX2N0eCkgPT4gVk5vZGVcclxuICB0ZW1wbGF0ZT86IHN0cmluZ1xyXG4gIHNldHVwOiAocHJvcHM6IG9iamVjdCwgeyBlbWl0IH0pID0+IG9iamVjdFxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaCh0eXBlOiBzdHJpbmcpXHJcbmV4cG9ydCBmdW5jdGlvbiBoKHR5cGU6IHN0cmluZywgcHJvcHM6IG9iamVjdClcclxuZXhwb3J0IGZ1bmN0aW9uIGgodHlwZTogc3RyaW5nLCBjaGlsZHJlbjogQ2hpbGRyZW4pXHJcbmV4cG9ydCBmdW5jdGlvbiBoKHR5cGU6IHN0cmluZywgcHJvcHM6IG9iamVjdCwgY2hpbGRyZW46IENoaWxkcmVuKVxyXG5leHBvcnQgZnVuY3Rpb24gaChcclxuICB0eXBlOiBzdHJpbmcgfCBDb21wb25lbnQsXHJcbiAgcHJvcHNPckNoaWxkcmVuPzogb2JqZWN0IHwgQ2hpbGRyZW4sXHJcbiAgX2NoaWxkcmVuPzogQ2hpbGRyZW5cclxuKSB7XHJcbiAgbGV0IHByb3BzXHJcbiAgbGV0IGNoaWxkcmVuXHJcbiAgaWYgKGlzUHJvcHMocHJvcHNPckNoaWxkcmVuKSkge1xyXG4gICAgcHJvcHMgPSBwcm9wc09yQ2hpbGRyZW5cclxuICAgIGNoaWxkcmVuID0gW11cclxuICB9IGVsc2UgaWYgKGlzQ2hpbGRyZW4ocHJvcHNPckNoaWxkcmVuKSkge1xyXG4gICAgcHJvcHMgPSB7fVxyXG4gICAgY2hpbGRyZW4gPSBwcm9wc09yQ2hpbGRyZW5cclxuICB9IGVsc2Uge1xyXG4gICAgcHJvcHMgPSB7fVxyXG4gICAgY2hpbGRyZW4gPSBbXVxyXG4gIH1cclxuICBpZiAoX2NoaWxkcmVuKSB7XHJcbiAgICBjaGlsZHJlbiA9IF9jaGlsZHJlblxyXG4gIH1cclxuICByZXR1cm4gY3JlYXRlVk5vZGUodHlwZSwgcHJvcHMsIGNoaWxkcmVuKVxyXG59XHJcblxyXG5mdW5jdGlvbiBpc1Byb3BzKHByb3BzT3JDaGlsZHJlbj86IG9iamVjdCB8IENoaWxkcmVuKSB7XHJcbiAgcmV0dXJuIHR5cGVvZiBwcm9wc09yQ2hpbGRyZW4gPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkocHJvcHNPckNoaWxkcmVuKVxyXG59XHJcblxyXG5mdW5jdGlvbiBpc0NoaWxkcmVuKHByb3BzT3JDaGlsZHJlbj86IG9iamVjdCB8IENoaWxkcmVuKSB7XHJcbiAgcmV0dXJuIHR5cGVvZiBwcm9wc09yQ2hpbGRyZW4gPT09IFwic3RyaW5nXCIgfHwgQXJyYXkuaXNBcnJheShwcm9wc09yQ2hpbGRyZW4pXHJcbn1cclxuIiwiaW1wb3J0IHsgZ2V0Q3VycmVudEluc3RhbmNlIH0gZnJvbSBcIi4vY29tcG9uZW50XCJcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwcm92aWRlKGtleSwgdmFsdWUpIHtcclxuICBjb25zdCBjdXJyZW50SW5zdGFuY2UgPSBnZXRDdXJyZW50SW5zdGFuY2UoKVxyXG4gIGlmICghY3VycmVudEluc3RhbmNlKSByZXR1cm5cclxuICBjb25zdCBwYXJlbnRQcm92aWRlcyA9IGN1cnJlbnRJbnN0YW5jZS5wYXJlbnQ/LnByb3ZpZGVzXHJcbiAgaWYgKHBhcmVudFByb3ZpZGVzKSB7XHJcbiAgICBsZXQgeyBwcm92aWRlcyB9ID0gY3VycmVudEluc3RhbmNlXHJcbiAgICBpZiAocHJvdmlkZXMgPT09IHBhcmVudFByb3ZpZGVzKSB7XHJcbiAgICAgIHByb3ZpZGVzID0gY3VycmVudEluc3RhbmNlLnByb3ZpZGVzID0gT2JqZWN0LmNyZWF0ZShwYXJlbnRQcm92aWRlcylcclxuICAgIH1cclxuICAgIGlmIChwcm92aWRlcykgcHJvdmlkZXNba2V5XSA9IHZhbHVlXHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaW5qZWN0KGtleSwgZGVmYXVsdFZhbCkge1xyXG4gIGNvbnN0IGN1cnJlbnRJbnN0YW5jZSA9IGdldEN1cnJlbnRJbnN0YW5jZSgpXHJcbiAgaWYgKCFjdXJyZW50SW5zdGFuY2UpIHJldHVyblxyXG4gIGNvbnN0IHBhcmVudFByb3ZpZGVzID0gY3VycmVudEluc3RhbmNlLnBhcmVudD8ucHJvdmlkZXNcclxuICBpZiAocGFyZW50UHJvdmlkZXMpXHJcbiAgICByZXR1cm4gKFxyXG4gICAgICBwYXJlbnRQcm92aWRlc1trZXldIHx8XHJcbiAgICAgICh0eXBlb2YgZGVmYXVsdFZhbCA9PT0gXCJmdW5jdGlvblwiID8gZGVmYXVsdFZhbCgpIDogZGVmYXVsdFZhbClcclxuICAgIClcclxufVxyXG4iLCJpbXBvcnQgeyBjcmVhdGVSZW5kZXJlciB9IGZyb20gXCJAbWluLXZ1ZS9ydW50aW1lLWNvcmVcIlxyXG5leHBvcnQgKiBmcm9tIFwiQG1pbi12dWUvcnVudGltZS1jb3JlXCJcclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnQodHlwZTogc3RyaW5nKSB7XHJcbiAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodHlwZSlcclxufVxyXG5cclxuZnVuY3Rpb24gcGF0Y2hQcm9wKGVsOiBFbGVtZW50LCBrZXk6IHN0cmluZywgb2xkVmFsdWUsIG5ld1ZhbHVlKSB7XHJcbiAgY29uc3QgaXNPbiA9IChrZXk6IHN0cmluZykgPT4gL15vbltBLVpdLy50ZXN0KGtleSlcclxuICBpZiAoaXNPbihrZXkpKSB7XHJcbiAgICBjb25zdCBldmVudCA9IGtleS5zbGljZSgyKS50b0xvd2VyQ2FzZSgpXHJcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBuZXdWYWx1ZSlcclxuICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIG9sZFZhbHVlKVxyXG4gIH0gZWxzZSB7XHJcbiAgICBpZiAobmV3VmFsdWUgPT09IHVuZGVmaW5lZCB8fCBuZXdWYWx1ZSA9PT0gbnVsbCkge1xyXG4gICAgICBlbC5yZW1vdmVBdHRyaWJ1dGUoa2V5KVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZWwuc2V0QXR0cmlidXRlKGtleSwgbmV3VmFsdWUpXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBpbnNlcnQoZWw6IEVsZW1lbnQsIHBhcmVudDogRWxlbWVudCwgYW5jaG9yOiBFbGVtZW50IHwgbnVsbCA9IG51bGwpIHtcclxuICBwYXJlbnQuaW5zZXJ0QmVmb3JlKGVsLCBhbmNob3IpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVRleHROb2RlKGNvbnRlbnQ6IHN0cmluZykge1xyXG4gIHJldHVybiBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShjb250ZW50KVxyXG59XHJcblxyXG5mdW5jdGlvbiByZW1vdmUoY2hpbGQ6IEVsZW1lbnQpIHtcclxuICBjb25zdCBwYXJlbnQgPSBjaGlsZC5wYXJlbnROb2RlXHJcbiAgaWYgKHBhcmVudCkge1xyXG4gICAgcGFyZW50LnJlbW92ZUNoaWxkKGNoaWxkKVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc2V0RWxlbWVudFRleHQoZWw6IEVsZW1lbnQsIHRleHQ6IHN0cmluZykge1xyXG4gIGVsLnRleHRDb250ZW50ID0gdGV4dFxyXG59XHJcblxyXG5jb25zdCByZW5kZXJlcjogYW55ID0gY3JlYXRlUmVuZGVyZXIoe1xyXG4gIGNyZWF0ZUVsZW1lbnQsXHJcbiAgcGF0Y2hQcm9wLFxyXG4gIGluc2VydCxcclxuICBjcmVhdGVUZXh0Tm9kZSxcclxuICByZW1vdmUsXHJcbiAgc2V0RWxlbWVudFRleHQsXHJcbn0pXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQXBwKC4uLmFyZ3MpIHtcclxuICByZXR1cm4gcmVuZGVyZXIuY3JlYXRlQXBwKC4uLmFyZ3MpXHJcbn1cclxuIiwiZXhwb3J0IGNvbnN0IFRPX0RJU1BMQVlfU1RSSU5HID0gU3ltYm9sKFwidG9EaXNwbGF5U3RyaW5nXCIpXHJcbmV4cG9ydCBjb25zdCBDUkVBVEVfRUxFTUVOVF9WTk9ERSA9IFN5bWJvbChcImNyZWF0ZUVsZW1lbnRWTm9kZVwiKVxyXG5cclxuZXhwb3J0IGNvbnN0IGhlbHBlck1hcE5hbWUgPSB7XHJcbiAgW1RPX0RJU1BMQVlfU1RSSU5HXTogXCJ0b0Rpc3BsYXlTdHJpbmdcIixcclxuICBbQ1JFQVRFX0VMRU1FTlRfVk5PREVdOiBcImNyZWF0ZUVsZW1lbnRWTm9kZVwiLFxyXG59XHJcbiIsImltcG9ydCB7IENSRUFURV9FTEVNRU5UX1ZOT0RFIH0gZnJvbSBcIi4vcnVudGltZUhlbHBlcnNcIlxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBFbGVtZW50IHtcclxuICB0YWc6IHN0cmluZ1xyXG4gIHR5cGU6IE5vZGVUeXBlc1xyXG4gIHByb3BzPzogYW55XHJcbiAgY2hpbGRyZW46IGFueVtdXHJcbiAgY29kZWdlbk5vZGU/OiBhbnlcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBJbnRlcnBvbGF0aW9uIHtcclxuICB0eXBlOiBOb2RlVHlwZXNcclxuICBjb250ZW50OiB7XHJcbiAgICB0eXBlOiBOb2RlVHlwZXNcclxuICAgIGNvbnRlbnQ6IHN0cmluZ1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUZXh0IHtcclxuICB0eXBlOiBOb2RlVHlwZXNcclxuICBjb250ZW50OiBzdHJpbmdcclxufVxyXG5cclxuZXhwb3J0IHR5cGUgTm9kZSA9IEVsZW1lbnQgfCBJbnRlcnBvbGF0aW9uIHwgVGV4dFxyXG5cclxuZXhwb3J0IGVudW0gTm9kZVR5cGVzIHtcclxuICBJTlRFUlBPTEFUSU9OLFxyXG4gIFNJTVBMRV9FWFBSRVNTSU9OLFxyXG4gIEVMRU1FTlQsXHJcbiAgVEVYVCxcclxuICBST09ULFxyXG4gIENPTVBPVU5EX0VYUFJFU1NJT04sXHJcbn1cclxuXHJcbmV4cG9ydCBlbnVtIFRhZ1R5cGUge1xyXG4gIFNUQVJULFxyXG4gIEVORCxcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVZOb2RlQ2FsbChcclxuICBjb250ZXh0LFxyXG4gIHR5cGU6IE5vZGVUeXBlcyxcclxuICB0YWcsXHJcbiAgcHJvcHMsXHJcbiAgY2hpbGRyZW5cclxuKSB7XHJcbiAgY29udGV4dC5oZWxwZXIoQ1JFQVRFX0VMRU1FTlRfVk5PREUpXHJcbiAgcmV0dXJuIHtcclxuICAgIHR5cGUsXHJcbiAgICB0YWcsXHJcbiAgICBwcm9wcyxcclxuICAgIGNoaWxkcmVuLFxyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQge1xyXG4gIENSRUFURV9FTEVNRU5UX1ZOT0RFLFxyXG4gIFRPX0RJU1BMQVlfU1RSSU5HLFxyXG4gIGhlbHBlck1hcE5hbWUsXHJcbn0gZnJvbSBcIi4vcnVudGltZUhlbHBlcnNcIlxyXG5pbXBvcnQgeyBFbGVtZW50LCBJbnRlcnBvbGF0aW9uLCBOb2RlVHlwZXMsIFRleHQgfSBmcm9tIFwiLi9hc3RcIlxyXG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gXCJAbWluLXZ1ZS9zaGFyZWRcIlxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlKGFzdCkge1xyXG4gIGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb2RlZ2VuQ29udGV4dCgpXHJcbiAgY29uc3QgeyBwdXNoIH0gPSBjb250ZXh0XHJcblxyXG4gIC8vIOWJjeWvvOeggVxyXG4gIGdlbkZ1bmN0aW9uUHJlYW1ibGUoYXN0LCBjb250ZXh0KVxyXG5cclxuICBjb25zdCBmdW5jdGlvbk5hbWUgPSBcInJlbmRlclwiXHJcbiAgY29uc3QgYXJncyA9IFtcIl9jdHhcIiwgXCJfY2FjaGVcIl1cclxuICBjb25zdCBzaWduYXR1cmUgPSBhcmdzLmpvaW4oXCIsIFwiKVxyXG5cclxuICBwdXNoKGBmdW5jdGlvbiAke2Z1bmN0aW9uTmFtZX0oJHtzaWduYXR1cmV9KXtgKVxyXG5cclxuICBwdXNoKFwicmV0dXJuIFwiKVxyXG4gIGdlbk5vZGUoYXN0LmNvZGVnZW5Ob2RlLCBjb250ZXh0KVxyXG4gIHB1c2goXCJ9XCIpXHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBjb2RlOiBjb250ZXh0LmNvZGUsXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZW5GdW5jdGlvblByZWFtYmxlKGFzdCwgY29udGV4dCkge1xyXG4gIGNvbnN0IHsgcHVzaCB9ID0gY29udGV4dFxyXG4gIGNvbnN0IFZ1ZUJpbmdpbmcgPSBcIlZ1ZVwiXHJcbiAgY29uc3QgYWxpYXNIZWxwZXIgPSAocykgPT4gYCR7aGVscGVyTWFwTmFtZVtzXX06IF8ke2hlbHBlck1hcE5hbWVbc119YFxyXG4gIGlmIChhc3QuaGVscGVycy5sZW5ndGgpIHtcclxuICAgIHB1c2goXHJcbiAgICAgIGBjb25zdCB7ICR7YXN0LmhlbHBlcnMubWFwKGFsaWFzSGVscGVyKS5qb2luKFwiLCBcIil9IH0gPSAke1Z1ZUJpbmdpbmd9O2BcclxuICAgIClcclxuICB9XHJcbiAgcHVzaChcInJldHVybiBcIilcclxufVxyXG5cclxuZnVuY3Rpb24gZ2VuTm9kZShub2RlLCBjb250ZXh0KSB7XHJcbiAgc3dpdGNoIChub2RlLnR5cGUpIHtcclxuICAgIGNhc2UgTm9kZVR5cGVzLlRFWFQ6XHJcbiAgICAgIGdlblRleHQobm9kZSwgY29udGV4dClcclxuICAgICAgYnJlYWtcclxuICAgIGNhc2UgTm9kZVR5cGVzLklOVEVSUE9MQVRJT046XHJcbiAgICAgIGdlbkludGVycG9sYXRpb24obm9kZSwgY29udGV4dClcclxuICAgICAgYnJlYWtcclxuICAgIGNhc2UgTm9kZVR5cGVzLlNJTVBMRV9FWFBSRVNTSU9OOlxyXG4gICAgICBnZW5FeHByZXNzaW9uKG5vZGUsIGNvbnRleHQpXHJcbiAgICAgIGJyZWFrXHJcbiAgICBjYXNlIE5vZGVUeXBlcy5FTEVNRU5UOlxyXG4gICAgICBnZW5FbGVtZW50KG5vZGUsIGNvbnRleHQpXHJcbiAgICAgIGJyZWFrXHJcbiAgICBjYXNlIE5vZGVUeXBlcy5DT01QT1VORF9FWFBSRVNTSU9OOlxyXG4gICAgICBnZW5Db21wb3VuZEV4cHJlc3Npb24obm9kZSwgY29udGV4dClcclxuICAgICAgYnJlYWtcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgIGJyZWFrXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZW5Db21wb3VuZEV4cHJlc3Npb24obm9kZSwgY29udGV4dCkge1xyXG4gIGNvbnN0IHsgcHVzaCB9ID0gY29udGV4dFxyXG4gIGNvbnN0IGNoaWxkcmVuID0gbm9kZS5jaGlsZHJlblxyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcclxuICAgIGNvbnN0IGNoaWxkID0gY2hpbGRyZW5baV1cclxuICAgIGlmIChpc1N0cmluZyhjaGlsZCkpIHtcclxuICAgICAgcHVzaChjaGlsZClcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGdlbk5vZGUoY2hpbGQsIGNvbnRleHQpXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZW5FbGVtZW50KG5vZGU6IEVsZW1lbnQsIGNvbnRleHQpIHtcclxuICBjb25zdCB7IHB1c2gsIGhlbHBlciB9ID0gY29udGV4dFxyXG4gIGNvbnN0IHsgdGFnLCBjaGlsZHJlbiwgcHJvcHMgfSA9IG5vZGVcclxuICBwdXNoKGAke2hlbHBlcihDUkVBVEVfRUxFTUVOVF9WTk9ERSl9KGApXHJcbiAgZ2VuTm9kZUxpc3QoZ2VuTnVsbGFibGUoW3RhZywgcHJvcHMsIGNoaWxkcmVuXSksIGNvbnRleHQpXHJcbiAgcHVzaChcIilcIilcclxufVxyXG5cclxuZnVuY3Rpb24gZ2VuTm9kZUxpc3Qobm9kZXM6IGFueVtdLCBjb250ZXh0KSB7XHJcbiAgY29uc3QgeyBwdXNoIH0gPSBjb250ZXh0XHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBub2Rlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgY29uc3Qgbm9kZSA9IG5vZGVzW2ldXHJcbiAgICBpZiAoaXNTdHJpbmcobm9kZSkpIHtcclxuICAgICAgcHVzaChub2RlKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZ2VuTm9kZShub2RlLCBjb250ZXh0KVxyXG4gICAgfVxyXG4gICAgaWYgKGkgPCBub2Rlcy5sZW5ndGggLSAxKSB7XHJcbiAgICAgIHB1c2goXCIsIFwiKVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2VuTnVsbGFibGUoYXJnczogYW55W10pIHtcclxuICByZXR1cm4gYXJncy5tYXAoKGFyZykgPT4gYXJnIHx8IFwibnVsbFwiKVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZW5UZXh0KG5vZGU6IFRleHQsIGNvbnRleHQpIHtcclxuICBjb25zdCB7IHB1c2ggfSA9IGNvbnRleHRcclxuICBwdXNoKGAnJHtub2RlLmNvbnRlbnR9J2ApXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdlbkludGVycG9sYXRpb24obm9kZTogSW50ZXJwb2xhdGlvbiwgY29udGV4dCkge1xyXG4gIGNvbnN0IHsgcHVzaCwgaGVscGVyIH0gPSBjb250ZXh0XHJcbiAgcHVzaChgJHtoZWxwZXIoVE9fRElTUExBWV9TVFJJTkcpfShgKVxyXG4gIGdlbk5vZGUobm9kZS5jb250ZW50LCBjb250ZXh0KVxyXG4gIHB1c2goXCIpXCIpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdlbkV4cHJlc3Npb24obm9kZTogSW50ZXJwb2xhdGlvbltcImNvbnRlbnRcIl0sIGNvbnRleHQpIHtcclxuICBjb25zdCB7IHB1c2ggfSA9IGNvbnRleHRcclxuICBwdXNoKGAke25vZGUuY29udGVudH1gKVxyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVDb2RlZ2VuQ29udGV4dCgpIHtcclxuICBjb25zdCBjb250ZXh0ID0ge1xyXG4gICAgY29kZTogXCJcIixcclxuICAgIHB1c2goc291cmNlOiBzdHJpbmcpIHtcclxuICAgICAgY29udGV4dC5jb2RlICs9IHNvdXJjZVxyXG4gICAgfSxcclxuICAgIGhlbHBlcihrZXkpIHtcclxuICAgICAgcmV0dXJuIGBfJHtoZWxwZXJNYXBOYW1lW2tleV19YFxyXG4gICAgfSxcclxuICB9XHJcblxyXG4gIHJldHVybiBjb250ZXh0XHJcbn1cclxuIiwiaW1wb3J0IHsgRWxlbWVudCwgSW50ZXJwb2xhdGlvbiwgTm9kZVR5cGVzLCBUYWdUeXBlLCBUZXh0IH0gZnJvbSBcIi4vYXN0XCJcclxuXHJcbmludGVyZmFjZSBDb250ZXh0IHtcclxuICBzb3VyY2U6IHN0cmluZ1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYmFzZVBhcnNlKGNvbnRlbnQ6IHN0cmluZykge1xyXG4gIGNvbnN0IGNvbnRleHQgPSBjcmVhdGVQYXJzZXJDb250ZXh0KGNvbnRlbnQpXHJcblxyXG4gIHJldHVybiBjcmVhdGVSb290KHBhcnNlQ2hpbGRyZW4oY29udGV4dCwgW10pKVxyXG59XHJcblxyXG5mdW5jdGlvbiBwYXJzZUNoaWxkcmVuKGNvbnRleHQ6IENvbnRleHQsIGFuY2VzdG9yczogRWxlbWVudFtdKSB7XHJcbiAgY29uc3Qgbm9kZXM6IGFueVtdID0gW11cclxuXHJcbiAgd2hpbGUgKCFpc0VuZChjb250ZXh0LCBhbmNlc3RvcnMpKSB7XHJcbiAgICBsZXQgbm9kZVxyXG4gICAgLy8ge3t9fVxyXG4gICAgY29uc3QgcyA9IGNvbnRleHQuc291cmNlXHJcbiAgICBpZiAocy5zdGFydHNXaXRoKFwie3tcIikpIHtcclxuICAgICAgbm9kZSA9IHBhcnNlSW50ZXJwb2xhdGlvbihjb250ZXh0KVxyXG4gICAgfSBlbHNlIGlmIChzWzBdID09PSBcIjxcIikge1xyXG4gICAgICAvLyBlbGVtZW50XHJcbiAgICAgIGlmICgvW2Etel0vaS50ZXN0KHNbMV0pKSB7XHJcbiAgICAgICAgbm9kZSA9IHBhcnNlRWxlbWVudChjb250ZXh0LCBhbmNlc3RvcnMpXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIHRleHRcclxuICAgIGlmICghbm9kZSkge1xyXG4gICAgICBub2RlID0gcGFyc2VUZXh0KGNvbnRleHQsIGFuY2VzdG9ycylcclxuICAgIH1cclxuICAgIGlmIChub2RlKSB7XHJcbiAgICAgIG5vZGVzLnB1c2gobm9kZSlcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiBub2Rlc1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc0VuZChjb250ZXh0OiBDb250ZXh0LCBhbmNlc3RvcnM6IEVsZW1lbnRbXSkge1xyXG4gIC8vIDEuIHNvdXJjZeacieWAvOeahOaXtuWAmVxyXG4gIC8vIDIuIOmBh+WIsOe7k+adn+agh+etvueahOaXtuWAmVxyXG4gIGNvbnN0IHMgPSBjb250ZXh0LnNvdXJjZVxyXG4gIGNvbnN0IGV4cGVjdFRhZyA9IGFuY2VzdG9yc1thbmNlc3RvcnMubGVuZ3RoIC0gMV0/LnRhZ1xyXG4gIGZvciAobGV0IGkgPSBhbmNlc3RvcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgIGNvbnN0IHRhZyA9IGFuY2VzdG9yc1tpXS50YWdcclxuICAgIGlmIChzLnN0YXJ0c1dpdGgoYDwvJHt0YWd9PmApKSB7XHJcbiAgICAgIGlmICh0YWcgIT09IGV4cGVjdFRhZykge1xyXG4gICAgICAgIHRocm93IEVycm9yKGDkuI3lrZjlnKjnu5PmnZ/moIfnrb4gPC8ke2V4cGVjdFRhZ30+YClcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiAhc1xyXG59XHJcblxyXG4vLyDlpITnkIZlbGVtZW50XHJcbmZ1bmN0aW9uIHBhcnNlRWxlbWVudChjb250ZXh0OiBDb250ZXh0LCBhbmNlc3RvcnM6IEVsZW1lbnRbXSkge1xyXG4gIGNvbnN0IGVsZW1lbnQgPSBwYXJzZVRhZyhjb250ZXh0LCBUYWdUeXBlLlNUQVJUKSBhcyBFbGVtZW50XHJcblxyXG4gIGFuY2VzdG9ycy5wdXNoKGVsZW1lbnQpXHJcbiAgZWxlbWVudC5jaGlsZHJlbiA9IHBhcnNlQ2hpbGRyZW4oY29udGV4dCwgYW5jZXN0b3JzKVxyXG4gIGFuY2VzdG9ycy5wb3AoKVxyXG5cclxuICBwYXJzZVRhZyhjb250ZXh0LCBUYWdUeXBlLkVORClcclxuICByZXR1cm4gZWxlbWVudFxyXG59XHJcblxyXG5mdW5jdGlvbiBwYXJzZVRhZyhjb250ZXh0OiBDb250ZXh0LCB0YWdUeXBlOiBUYWdUeXBlKSB7XHJcbiAgY29uc3QgbWF0Y2ggPSAvXjxcXC8/KFthLXpdKikvaS5leGVjKGNvbnRleHQuc291cmNlKSBhcyBSZWdFeHBFeGVjQXJyYXlcclxuICBjb25zdCB0YWcgPSBtYXRjaFsxXVxyXG4gIGFkdmFuY2VCeShjb250ZXh0LCBtYXRjaFswXS5sZW5ndGgpXHJcbiAgYWR2YW5jZUJ5KGNvbnRleHQsIDEpXHJcblxyXG4gIGlmICh0YWdUeXBlID09PSBUYWdUeXBlLkVORCkgcmV0dXJuXHJcbiAgcmV0dXJuIHtcclxuICAgIHR5cGU6IE5vZGVUeXBlcy5FTEVNRU5ULFxyXG4gICAgdGFnLFxyXG4gICAgY2hpbGRyZW46IFtdLFxyXG4gIH1cclxufVxyXG5cclxuLy8g5aSE55CG5o+S5YC8XHJcbmZ1bmN0aW9uIHBhcnNlSW50ZXJwb2xhdGlvbihjb250ZXh0OiBDb250ZXh0KTogSW50ZXJwb2xhdGlvbiB7XHJcbiAgY29uc3Qgb3BlbkRlbGltaXRlciA9IFwie3tcIlxyXG4gIGNvbnN0IGNsb3NlRGVsaW1pdGVyID0gXCJ9fVwiXHJcblxyXG4gIGNvbnN0IGNsb3NlSW5kZXggPSBjb250ZXh0LnNvdXJjZS5pbmRleE9mKFxyXG4gICAgY2xvc2VEZWxpbWl0ZXIsXHJcbiAgICBvcGVuRGVsaW1pdGVyLmxlbmd0aFxyXG4gIClcclxuXHJcbiAgYWR2YW5jZUJ5KGNvbnRleHQsIG9wZW5EZWxpbWl0ZXIubGVuZ3RoKVxyXG5cclxuICBjb25zdCByYXdDb250ZW50TGVuZ3RoID0gY2xvc2VJbmRleCAtIG9wZW5EZWxpbWl0ZXIubGVuZ3RoXHJcbiAgY29uc3QgcmF3Q29udGVudCA9IHBhcnNlVGV4dERhdGEoY29udGV4dCwgcmF3Q29udGVudExlbmd0aClcclxuICBjb25zdCBjb250ZW50ID0gcmF3Q29udGVudC50cmltKClcclxuXHJcbiAgYWR2YW5jZUJ5KGNvbnRleHQsIHJhd0NvbnRlbnRMZW5ndGggKyBjbG9zZURlbGltaXRlci5sZW5ndGgpXHJcblxyXG4gIHJldHVybiB7XHJcbiAgICB0eXBlOiBOb2RlVHlwZXMuSU5URVJQT0xBVElPTixcclxuICAgIGNvbnRlbnQ6IHtcclxuICAgICAgdHlwZTogTm9kZVR5cGVzLlNJTVBMRV9FWFBSRVNTSU9OLFxyXG4gICAgICBjb250ZW50LFxyXG4gICAgfSxcclxuICB9XHJcbn1cclxuXHJcbi8vIOWkhOeQhnRleHRcclxuZnVuY3Rpb24gcGFyc2VUZXh0KGNvbnRleHQ6IENvbnRleHQsIGFuY2VzdG9yczogRWxlbWVudFtdKTogVGV4dCB7XHJcbiAgbGV0IGVuZEluZGV4ID0gY29udGV4dC5zb3VyY2UubGVuZ3RoXHJcbiAgY29uc3QgdG9wRWxlbWVudCA9IGFuY2VzdG9yc1thbmNlc3RvcnMubGVuZ3RoIC0gMV1cclxuICBjb25zdCBlbmRUb2tlbiA9IFtcInt7XCIsIGA8LyR7dG9wRWxlbWVudD8udGFnIHx8IFwiXCJ9PmBdXHJcblxyXG4gIGNvbnN0IGluZGV4ID0gZW5kVG9rZW5cclxuICAgIC5tYXAoKHRva2VuKSA9PiBjb250ZXh0LnNvdXJjZS5pbmRleE9mKHRva2VuKSlcclxuICAgIC5maWx0ZXIoKGkpID0+IGkgIT09IC0xKVxyXG4gICAgLnNvcnQoKGEsIGIpID0+IGEgLSBiKVswXVxyXG4gIGlmIChpbmRleCkge1xyXG4gICAgZW5kSW5kZXggPSBpbmRleFxyXG4gIH1cclxuICBjb25zdCBjb250ZW50ID0gcGFyc2VUZXh0RGF0YShjb250ZXh0LCBlbmRJbmRleClcclxuXHJcbiAgYWR2YW5jZUJ5KGNvbnRleHQsIGNvbnRlbnQubGVuZ3RoKVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgdHlwZTogTm9kZVR5cGVzLlRFWFQsXHJcbiAgICBjb250ZW50LFxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcGFyc2VUZXh0RGF0YShjb250ZXh0OiBDb250ZXh0LCBsZW5ndGg6IG51bWJlcikge1xyXG4gIHJldHVybiBjb250ZXh0LnNvdXJjZS5zbGljZSgwLCBsZW5ndGgpXHJcbn1cclxuXHJcbi8vIOaOqOi/m+WIoOmZpFxyXG5mdW5jdGlvbiBhZHZhbmNlQnkoY29udGV4dDogQ29udGV4dCwgbGVuZ3RoOiBudW1iZXIpIHtcclxuICBjb250ZXh0LnNvdXJjZSA9IGNvbnRleHQuc291cmNlLnNsaWNlKGxlbmd0aClcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlUm9vdChjaGlsZHJlbikge1xyXG4gIHJldHVybiB7XHJcbiAgICBjaGlsZHJlbixcclxuICAgIHR5cGU6IE5vZGVUeXBlcy5ST09ULFxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlUGFyc2VyQ29udGV4dChjb250ZW50OiBzdHJpbmcpOiBDb250ZXh0IHtcclxuICByZXR1cm4ge1xyXG4gICAgc291cmNlOiBjb250ZW50LFxyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgeyBFbGVtZW50LCBJbnRlcnBvbGF0aW9uLCBOb2RlVHlwZXMsIFRleHQgfSBmcm9tIFwiLi9hc3RcIlxyXG5pbXBvcnQgeyBUT19ESVNQTEFZX1NUUklORyB9IGZyb20gXCIuL3J1bnRpbWVIZWxwZXJzXCJcclxuXHJcbnR5cGUgTWl4aW5Ob2RlID0gRWxlbWVudCAmXHJcbiAgSW50ZXJwb2xhdGlvbiAmXHJcbiAgVGV4dCAmIHsgY29kZWdlbk5vZGU/OiBFbGVtZW50OyBoZWxwZXJzOiBzdHJpbmdbXSB9XHJcblxyXG50eXBlIE9wdGlvbnMgPSB7XHJcbiAgbm9kZVRyYW5zZm9ybXM/OiAoKG5vZGU6IGFueSwgY29udGV4dDogYW55KSA9PiB7fSlbXVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdHJhbnNmb3JtKHJvb3Q6IE1peGluTm9kZSwgb3B0aW9uczogT3B0aW9ucyA9IHt9KSB7XHJcbiAgY29uc3QgY29udGV4dCA9IGNyZWF0ZVRyYW5zZm9ybUNvbnRleHQocm9vdCwgb3B0aW9ucylcclxuICB0cmF2ZXJzZU5vZGUocm9vdCwgY29udGV4dClcclxuXHJcbiAgY3JlYXRlUm9vdENvZGVnZW4ocm9vdClcclxuXHJcbiAgcm9vdC5oZWxwZXJzID0gWy4uLmNvbnRleHQuaGVscGVycy5rZXlzKCldXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVJvb3RDb2RlZ2VuKHJvb3Q6IE1peGluTm9kZSkge1xyXG4gIGNvbnN0IGNoaWxkID0gcm9vdC5jaGlsZHJlblswXVxyXG4gIGlmIChjaGlsZC50eXBlID09PSBOb2RlVHlwZXMuRUxFTUVOVCkge1xyXG4gICAgcm9vdC5jb2RlZ2VuTm9kZSA9IGNoaWxkLmNvZGVnZW5Ob2RlXHJcbiAgfSBlbHNlIHtcclxuICAgIHJvb3QuY29kZWdlbk5vZGUgPSByb290LmNoaWxkcmVuWzBdXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVUcmFuc2Zvcm1Db250ZXh0KHJvb3Q6IE1peGluTm9kZSwgb3B0aW9uczogT3B0aW9ucykge1xyXG4gIGNvbnN0IGNvbnRleHQgPSB7XHJcbiAgICByb290LFxyXG4gICAgbm9kZVRyYW5zZm9ybXM6IG9wdGlvbnMubm9kZVRyYW5zZm9ybXMgfHwgW10sXHJcbiAgICBoZWxwZXJzOiBuZXcgTWFwKCksXHJcbiAgICBoZWxwZXIoa2V5OiBTeW1ib2wpIHtcclxuICAgICAgY29udGV4dC5oZWxwZXJzLnNldChrZXksIDEpXHJcbiAgICB9LFxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGNvbnRleHRcclxufVxyXG5cclxudHlwZSBDb250ZXh0ID0gUmV0dXJuVHlwZTx0eXBlb2YgY3JlYXRlVHJhbnNmb3JtQ29udGV4dD5cclxuXHJcbmZ1bmN0aW9uIHRyYXZlcnNlTm9kZShub2RlOiBNaXhpbk5vZGUsIGNvbnRleHQ6IENvbnRleHQpIHtcclxuICBjb25zdCBub2RlVHJhbnNmb3JtcyA9IGNvbnRleHQubm9kZVRyYW5zZm9ybXNcclxuICBjb25zdCBleGl0Rm5zOiBhbnlbXSA9IFtdXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBub2RlVHJhbnNmb3Jtcy5sZW5ndGg7IGkrKykge1xyXG4gICAgY29uc3QgdHJhbnNmb3JtID0gbm9kZVRyYW5zZm9ybXNbaV1cclxuICAgIGNvbnN0IG9uRXhpdCA9IHRyYW5zZm9ybShub2RlLCBjb250ZXh0KVxyXG4gICAgaWYgKG9uRXhpdCkgZXhpdEZucy5wdXNoKG9uRXhpdClcclxuICB9XHJcblxyXG4gIHN3aXRjaCAobm9kZS50eXBlKSB7XHJcbiAgICBjYXNlIE5vZGVUeXBlcy5JTlRFUlBPTEFUSU9OOlxyXG4gICAgICBjb250ZXh0LmhlbHBlcihUT19ESVNQTEFZX1NUUklORylcclxuICAgICAgYnJlYWtcclxuICAgIGNhc2UgTm9kZVR5cGVzLlJPT1Q6XHJcbiAgICBjYXNlIE5vZGVUeXBlcy5FTEVNRU5UOlxyXG4gICAgICB0cmF2ZXJzZUNoaWxkcmVuKG5vZGUsIGNvbnRleHQpXHJcbiAgICAgIGJyZWFrXHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICBicmVha1xyXG4gIH1cclxuXHJcbiAgbGV0IGkgPSBleGl0Rm5zLmxlbmd0aFxyXG4gIHdoaWxlIChpLS0pIHtcclxuICAgIGV4aXRGbnNbaV0oKVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gdHJhdmVyc2VDaGlsZHJlbihub2RlOiBNaXhpbk5vZGUsIGNvbnRleHQ6IENvbnRleHQpIHtcclxuICBjb25zdCBjaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW5cclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBjb25zdCBub2RlID0gY2hpbGRyZW5baV1cclxuICAgIHRyYXZlcnNlTm9kZShub2RlLCBjb250ZXh0KVxyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgeyBFbGVtZW50LCBOb2RlVHlwZXMsIGNyZWF0ZVZOb2RlQ2FsbCB9IGZyb20gXCIuLi9hc3RcIlxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHRyYW5zZm9ybUVsZW1lbnQobm9kZTogRWxlbWVudCwgY29udGV4dCkge1xyXG4gIGlmIChub2RlLnR5cGUgPT09IE5vZGVUeXBlcy5FTEVNRU5UKSB7XHJcbiAgICByZXR1cm4gKCkgPT4ge1xyXG4gICAgICAvLyDkuK3pl7TlpITnkIblsYJcclxuXHJcbiAgICAgIC8vIHRhZ1xyXG4gICAgICBjb25zdCB2bm9kZVRhZyA9IGBcIiR7bm9kZS50YWd9XCJgXHJcbiAgICAgIC8vIHByb3BzXHJcbiAgICAgIGNvbnN0IHZub2RlUHJvcHMgPSBudWxsXHJcbiAgICAgIC8vIGNoaWxkcmVuXHJcbiAgICAgIGNvbnN0IGNoaWxkcmVuID0gbm9kZS5jaGlsZHJlblxyXG4gICAgICBjb25zdCB2bm9kZUNoaWxkcmVuID0gY2hpbGRyZW5bMF1cclxuXHJcbiAgICAgIG5vZGUuY29kZWdlbk5vZGUgPSBjcmVhdGVWTm9kZUNhbGwoXHJcbiAgICAgICAgY29udGV4dCxcclxuICAgICAgICBub2RlLnR5cGUsXHJcbiAgICAgICAgdm5vZGVUYWcsXHJcbiAgICAgICAgdm5vZGVQcm9wcyxcclxuICAgICAgICB2bm9kZUNoaWxkcmVuXHJcbiAgICAgIClcclxuICAgIH1cclxuICB9XHJcbn1cclxuIiwiaW1wb3J0IHsgTm9kZVR5cGVzIH0gZnJvbSBcIi4uL2FzdFwiXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdHJhbnNmb3JtRXhwcmVzc2lvbihub2RlKSB7XHJcbiAgaWYgKG5vZGUudHlwZSA9PT0gTm9kZVR5cGVzLklOVEVSUE9MQVRJT04pIHtcclxuICAgIHByb2Nlc3NFeHByZXNzaW9uKG5vZGUuY29udGVudClcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHByb2Nlc3NFeHByZXNzaW9uKG5vZGUpIHtcclxuICBub2RlLmNvbnRlbnQgPSBgX2N0eC4ke25vZGUuY29udGVudH1gXHJcbn1cclxuIiwiaW1wb3J0IHsgRWxlbWVudCwgTm9kZVR5cGVzIH0gZnJvbSBcIi4vYXN0XCJcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc1RleHQobm9kZTogRWxlbWVudCkge1xyXG4gIHJldHVybiBub2RlLnR5cGUgPT09IE5vZGVUeXBlcy5URVhUIHx8IG5vZGUudHlwZSA9PT0gTm9kZVR5cGVzLklOVEVSUE9MQVRJT05cclxufVxyXG4iLCJpbXBvcnQgeyBFbGVtZW50LCBOb2RlVHlwZXMgfSBmcm9tIFwiLi4vYXN0XCJcclxuaW1wb3J0IHsgaXNUZXh0IH0gZnJvbSBcIi4uL3V0aWxzXCJcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0cmFuc2Zvcm1UZXh0KG5vZGU6IEVsZW1lbnQpIHtcclxuICBpZiAobm9kZS50eXBlID09PSBOb2RlVHlwZXMuRUxFTUVOVCkge1xyXG4gICAgcmV0dXJuICgpID0+IHtcclxuICAgICAgY29uc3QgeyBjaGlsZHJlbiB9ID0gbm9kZVxyXG4gICAgICBsZXQgY3VycmVudENvbnRhaW5lclxyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hpbGQgPSBjaGlsZHJlbltpXVxyXG4gICAgICAgIGlmIChpc1RleHQoY2hpbGQpKSB7XHJcbiAgICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBjaGlsZHJlbi5sZW5ndGg7IGorKykge1xyXG4gICAgICAgICAgICBjb25zdCBuZXh0Q2hpbGQgPSBjaGlsZHJlbltqXVxyXG4gICAgICAgICAgICBpZiAoaXNUZXh0KG5leHRDaGlsZCkpIHtcclxuICAgICAgICAgICAgICBpZiAoIWN1cnJlbnRDb250YWluZXIpIHtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRDb250YWluZXIgPSBjaGlsZHJlbltpXSA9IHtcclxuICAgICAgICAgICAgICAgICAgdHlwZTogTm9kZVR5cGVzLkNPTVBPVU5EX0VYUFJFU1NJT04sXHJcbiAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBbY2hpbGRdLFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBjdXJyZW50Q29udGFpbmVyLmNoaWxkcmVuLnB1c2goXCIgKyBcIilcclxuICAgICAgICAgICAgICBjdXJyZW50Q29udGFpbmVyLmNoaWxkcmVuLnB1c2gobmV4dENoaWxkKVxyXG4gICAgICAgICAgICAgIGNoaWxkcmVuLnNwbGljZShqLCAxKVxyXG4gICAgICAgICAgICAgIGotLVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGN1cnJlbnRDb250YWluZXIgPSB1bmRlZmluZWRcclxuICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB7IGdlbmVyYXRlIH0gZnJvbSBcIi4vY29kZWdlblwiXHJcbmltcG9ydCB7IGJhc2VQYXJzZSB9IGZyb20gXCIuL3BhcnNlXCJcclxuaW1wb3J0IHsgdHJhbnNmb3JtIH0gZnJvbSBcIi4vdHJhbnNmb3JtXCJcclxuaW1wb3J0IHsgdHJhbnNmb3JtRWxlbWVudCB9IGZyb20gXCIuL3RyYW5zZm9ybXMvdHJhbnNmb3JtRWxlbWVudFwiXHJcbmltcG9ydCB7IHRyYW5zZm9ybUV4cHJlc3Npb24gfSBmcm9tIFwiLi90cmFuc2Zvcm1zL3RyYW5zZm9ybUV4cHJlc3Npb25cIlxyXG5pbXBvcnQgeyB0cmFuc2Zvcm1UZXh0IH0gZnJvbSBcIi4vdHJhbnNmb3Jtcy90cmFuc2Zvcm1UZXh0XCJcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBiYXNlQ29tcGlsZSh0ZW1wbGF0ZTogc3RyaW5nKSB7XHJcbiAgY29uc3QgYXN0ID0gYmFzZVBhcnNlKHRlbXBsYXRlKVxyXG4gIHRyYW5zZm9ybShhc3QgYXMgYW55LCB7XHJcbiAgICBub2RlVHJhbnNmb3JtczogW1xyXG4gICAgICB0cmFuc2Zvcm1FeHByZXNzaW9uLFxyXG4gICAgICB0cmFuc2Zvcm1FbGVtZW50IGFzIGFueSxcclxuICAgICAgdHJhbnNmb3JtVGV4dCxcclxuICAgIF0sXHJcbiAgfSlcclxuXHJcbiAgcmV0dXJuIGdlbmVyYXRlKGFzdClcclxufVxyXG4iLCIvLyBtaW4tdnVl5Ye65Y+jXHJcbmV4cG9ydCAqIGZyb20gXCJAbWluLXZ1ZS9ydW50aW1lLWRvbVwiXHJcblxyXG5pbXBvcnQgeyBiYXNlQ29tcGlsZSB9IGZyb20gXCJAbWluLXZ1ZS9jb21waWxlci1jb3JlXCJcclxuaW1wb3J0ICogYXMgcnVudGltZURvbSBmcm9tIFwiQG1pbi12dWUvcnVudGltZS1kb21cIlxyXG5pbXBvcnQgeyByZWdpc3RlclJ1bnRpbWVDb21waWxlciB9IGZyb20gXCJAbWluLXZ1ZS9ydW50aW1lLWRvbVwiXHJcblxyXG5mdW5jdGlvbiBjb21waWxlVG9GdW5jdGlvbih0ZW1wbGF0ZSkge1xyXG4gIGNvbnN0IHsgY29kZSB9ID0gYmFzZUNvbXBpbGUodGVtcGxhdGUpXHJcblxyXG4gIGNvbnN0IHJlbmRlciA9IG5ldyBGdW5jdGlvbihcIlZ1ZVwiLCBjb2RlKShydW50aW1lRG9tKVxyXG5cclxuICByZXR1cm4gcmVuZGVyXHJcbn1cclxuXHJcbnJlZ2lzdGVyUnVudGltZUNvbXBpbGVyKGNvbXBpbGVUb0Z1bmN0aW9uKVxyXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBTSxTQUFVLGVBQWUsQ0FBQyxHQUFHLEVBQUE7QUFDakMsSUFBQSxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNwQjs7U0NBZ0IsTUFBTSxDQUFDLE1BQU0sRUFBRSxHQUFHLE1BQU0sRUFBQTtJQUN0QyxPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUE7QUFDekMsQ0FBQztBQUVLLFNBQVUsUUFBUSxDQUFDLEtBQUssRUFBQTtJQUM1QixPQUFPLEtBQUssS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxDQUFBO0FBQ3BELENBQUM7QUFFSyxTQUFVLFFBQVEsQ0FBQyxLQUFLLEVBQUE7QUFDNUIsSUFBQSxPQUFPLE9BQU8sS0FBSyxLQUFLLFFBQVEsQ0FBQTtBQUNsQyxDQUFDO0FBRUssU0FBVSxPQUFPLENBQUMsS0FBSyxFQUFBO0FBQzNCLElBQUEsT0FBTyxLQUFLLENBQUMs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
