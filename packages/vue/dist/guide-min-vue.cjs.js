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
    effect: effect,
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
exports.effect = effect;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3VpZGUtbWluLXZ1ZS5janMuanMiLCJzb3VyY2VzIjpbIi4uLy4uL3NoYXJlZC9zcmMvdG9EaXNwbGF5U3RyaW5nLnRzIiwiLi4vLi4vc2hhcmVkL3NyYy9pbmRleC50cyIsIi4uLy4uL3JlYWN0aXZpdHkvc3JjL2VmZmVjdC50cyIsIi4uLy4uL3JlYWN0aXZpdHkvc3JjL2Jhc2VIYW5kbGVyLnRzIiwiLi4vLi4vcmVhY3Rpdml0eS9zcmMvcmVhY3RpdmUudHMiLCIuLi8uLi9yZWFjdGl2aXR5L3NyYy9yZWYudHMiLCIuLi8uLi9yZWFjdGl2aXR5L3NyYy9jb21wdXRlZC50cyIsIi4uLy4uL3J1bnRpbWUtY29yZS9zcmMvY29tcG9uZW50RW1pdC50cyIsIi4uLy4uL3J1bnRpbWUtY29yZS9zcmMvY29tcG9uZW50UHJvcHMudHMiLCIuLi8uLi9ydW50aW1lLWNvcmUvc3JjL2NvbXBvbmVudFB1YmxpY0luc3RhbmNlLnRzIiwiLi4vLi4vcnVudGltZS1jb3JlL3NyYy9jb21wb25lbnRTbG90cy50cyIsIi4uLy4uL3J1bnRpbWUtY29yZS9zcmMvY29tcG9uZW50LnRzIiwiLi4vLi4vcnVudGltZS1jb3JlL3NyYy9jb21wb25lbnRVcGRhdGVVdGlscy50cyIsIi4uLy4uL3J1bnRpbWUtY29yZS9zcmMvdm5vZGUudHMiLCIuLi8uLi9ydW50aW1lLWNvcmUvc3JjL2NyZWF0ZUFwcC50cyIsIi4uLy4uL3J1bnRpbWUtY29yZS9zcmMvc2NoZWR1bGVyLnRzIiwiLi4vLi4vcnVudGltZS1jb3JlL3NyYy9yZW5kZXJlci50cyIsIi4uLy4uL3J1bnRpbWUtY29yZS9zcmMvcmVuZGVyU2xvdHMudHMiLCIuLi8uLi9ydW50aW1lLWNvcmUvc3JjL2gudHMiLCIuLi8uLi9ydW50aW1lLWNvcmUvc3JjL2FwaUluamVjdC50cyIsIi4uLy4uL3J1bnRpbWUtZG9tL3NyYy9pbmRleC50cyIsIi4uLy4uL2NvbXBpbGVyLWNvcmUvc3JjL3J1bnRpbWVIZWxwZXJzLnRzIiwiLi4vLi4vY29tcGlsZXItY29yZS9zcmMvYXN0LnRzIiwiLi4vLi4vY29tcGlsZXItY29yZS9zcmMvY29kZWdlbi50cyIsIi4uLy4uL2NvbXBpbGVyLWNvcmUvc3JjL3BhcnNlLnRzIiwiLi4vLi4vY29tcGlsZXItY29yZS9zcmMvdHJhbnNmb3JtLnRzIiwiLi4vLi4vY29tcGlsZXItY29yZS9zcmMvdHJhbnNmb3Jtcy90cmFuc2Zvcm1FbGVtZW50LnRzIiwiLi4vLi4vY29tcGlsZXItY29yZS9zcmMvdHJhbnNmb3Jtcy90cmFuc2Zvcm1FeHByZXNzaW9uLnRzIiwiLi4vLi4vY29tcGlsZXItY29yZS9zcmMvdXRpbHMudHMiLCIuLi8uLi9jb21waWxlci1jb3JlL3NyYy90cmFuc2Zvcm1zL3RyYW5zZm9ybVRleHQudHMiLCIuLi8uLi9jb21waWxlci1jb3JlL3NyYy9jb21waWxlLnRzIiwiLi4vc3JjL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBmdW5jdGlvbiB0b0Rpc3BsYXlTdHJpbmcodmFsKSB7XHJcbiAgcmV0dXJuIFN0cmluZyh2YWwpXHJcbn1cclxuIiwiZXhwb3J0ICogZnJvbSBcIi4vdG9EaXNwbGF5U3RyaW5nXCJcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBleHRlbmQob3JpZ2luLCAuLi50YXJnZXQpIHtcclxuICByZXR1cm4gT2JqZWN0LmFzc2lnbihvcmlnaW4sIC4uLnRhcmdldClcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlKSB7XHJcbiAgcmV0dXJuIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIlxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNTdHJpbmcodmFsdWUpIHtcclxuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0FycmF5KHZhbHVlKSB7XHJcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsdWUpXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBoYXNDaGFuZ2VkKHZhbHVlLCBuZXdWYWx1ZSkge1xyXG4gIHJldHVybiAhT2JqZWN0LmlzKHZhbHVlLCBuZXdWYWx1ZSlcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnRTdHJpbmdUb0hUTUxFbGVtZW50KFxyXG4gIHJvb3RDb250YWluZXI6IHN0cmluZyB8IEVsZW1lbnRcclxuKTogRWxlbWVudCB7XHJcbiAgbGV0IHJvb3RFbGVtZW50ID0gcm9vdENvbnRhaW5lclxyXG4gIGlmICh0eXBlb2Ygcm9vdENvbnRhaW5lciA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgcm9vdEVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHJvb3RDb250YWluZXIpIGFzIEVsZW1lbnRcclxuICB9XHJcbiAgcmV0dXJuIHJvb3RFbGVtZW50IGFzIEVsZW1lbnRcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGhhc093bih2YWw6IG9iamVjdCwga2V5OiBzdHJpbmcpIHtcclxuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbCwga2V5KVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2FtZWxpemUoc3RyOiBzdHJpbmcpIHtcclxuICByZXR1cm4gc3RyLnJlcGxhY2UoLy0oXFx3KS9nLCAoXywgYzogc3RyaW5nKSA9PiB7XHJcbiAgICByZXR1cm4gYyA/IGMudG9VcHBlckNhc2UoKSA6IFwiXCJcclxuICB9KVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2FwaXRhbGl6ZShzdHI6IHN0cmluZykge1xyXG4gIHJldHVybiBzdHIuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzdHIuc2xpY2UoMSlcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHRvSGFuZGxlcktleShzdHI6IHN0cmluZykge1xyXG4gIHJldHVybiBzdHIgPyBcIm9uXCIgKyBjYXBpdGFsaXplKHN0cikgOiBcIlwiXHJcbn1cclxuIiwiaW1wb3J0IHsgZXh0ZW5kIH0gZnJvbSBcIkBtaW4tdnVlL3NoYXJlZFwiXHJcblxyXG4vLyDlvZPliY3nmoTlia/kvZznlKjlh73mlbBcclxubGV0IGFjdGl2ZUVmZmVjdDogbnVsbCB8IFJlYWN0aXZlRWZmZWN0ID0gbnVsbFxyXG4vLyDmlLbpm4ZlZmZlY3Tlh73mlbBcclxuY29uc3QgYnVja2V0ID0gbmV3IFdlYWtNYXAoKVxyXG5sZXQgc2hvdWxkVHJhY2sgPSBmYWxzZVxyXG5leHBvcnQgY2xhc3MgUmVhY3RpdmVFZmZlY3Qge1xyXG4gIHByaXZhdGUgX2ZuOiBhbnlcclxuICAvLyDmmK/lkKbmsqHmnIlzdG9w6L+HXHJcbiAgcHJpdmF0ZSBhY3RpdmU6IGJvb2xlYW4gPSB0cnVlXHJcbiAgZGVwczogU2V0PFJlYWN0aXZlRWZmZWN0PltdID0gW11cclxuICBvblN0b3A6IEZ1bmN0aW9uIHwgdW5kZWZpbmVkXHJcblxyXG4gIGNvbnN0cnVjdG9yKGZuOiBGdW5jdGlvbiwgcHVibGljIHNjaGVkdWxlcj86IEZ1bmN0aW9uKSB7XHJcbiAgICB0aGlzLl9mbiA9IGZuXHJcbiAgICB0aGlzLnNjaGVkdWxlciA9IHNjaGVkdWxlclxyXG4gIH1cclxuXHJcbiAgcnVuKCkge1xyXG4gICAgaWYgKCF0aGlzLmFjdGl2ZSkge1xyXG4gICAgICByZXR1cm4gdGhpcy5fZm4oKVxyXG4gICAgfVxyXG5cclxuICAgIHNob3VsZFRyYWNrID0gdHJ1ZVxyXG5cclxuICAgIGFjdGl2ZUVmZmVjdCA9IHRoaXNcclxuICAgIGNvbnN0IHJlcyA9IHRoaXMuX2ZuKClcclxuICAgIHNob3VsZFRyYWNrID0gZmFsc2VcclxuICAgIGFjdGl2ZUVmZmVjdCA9IG51bGxcclxuICAgIHJldHVybiByZXNcclxuICB9XHJcbiAgc3RvcCgpIHtcclxuICAgIGlmICh0aGlzLmFjdGl2ZSkge1xyXG4gICAgICBjbGVhbnVwRWZmZWN0KHRoaXMpXHJcbiAgICAgIGlmICh0aGlzLm9uU3RvcCkge1xyXG4gICAgICAgIHRoaXMub25TdG9wKClcclxuICAgICAgfVxyXG4gICAgICB0aGlzLmFjdGl2ZSA9IGZhbHNlXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjbGVhbnVwRWZmZWN0KGVmZmVjdDogUmVhY3RpdmVFZmZlY3QpIHtcclxuICBlZmZlY3QuZGVwcy5mb3JFYWNoKChkZXA6IFNldDxSZWFjdGl2ZUVmZmVjdD4pID0+IHtcclxuICAgIGRlcC5kZWxldGUoZWZmZWN0KVxyXG4gIH0pXHJcbiAgZWZmZWN0LmRlcHMubGVuZ3RoID0gMFxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdHJhY2sodGFyZ2V0LCBrZXkpIHtcclxuICBpZiAoIWFjdGl2ZUVmZmVjdCkge1xyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG4gIGxldCBkZXBzTWFwID0gYnVja2V0LmdldCh0YXJnZXQpXHJcbiAgaWYgKCFkZXBzTWFwKSB7XHJcbiAgICBidWNrZXQuc2V0KHRhcmdldCwgKGRlcHNNYXAgPSBuZXcgTWFwKCkpKVxyXG4gIH1cclxuICBsZXQgZGVwc1NldCA9IGRlcHNNYXAuZ2V0KGtleSlcclxuICBpZiAoIWRlcHNTZXQpIHtcclxuICAgIGRlcHNNYXAuc2V0KGtleSwgKGRlcHNTZXQgPSBuZXcgU2V0KCkpKVxyXG4gIH1cclxuICB0cmFja0VmZmVjdChkZXBzU2V0KVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdHJhY2tFZmZlY3QoZGVwc1NldCkge1xyXG4gIGlmICghYWN0aXZlRWZmZWN0KSB7XHJcbiAgICByZXR1cm5cclxuICB9XHJcbiAgaWYgKGRlcHNTZXQuaGFzKGFjdGl2ZUVmZmVjdCkpIHtcclxuICAgIHJldHVyblxyXG4gIH1cclxuICBkZXBzU2V0LmFkZChhY3RpdmVFZmZlY3QpXHJcbiAgLy8g5Y+N5ZCR5pS26ZuG77yM55So5LqO5a6e546wc3RvcFxyXG4gIGFjdGl2ZUVmZmVjdC5kZXBzLnB1c2goZGVwc1NldClcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXIodGFyZ2V0LCBrZXkpIHtcclxuICBjb25zdCBkZXBzTWFwID0gYnVja2V0LmdldCh0YXJnZXQpXHJcbiAgaWYgKCFkZXBzTWFwKSB7XHJcbiAgICByZXR1cm5cclxuICB9XHJcbiAgY29uc3QgZGVwc1NldCA9IGRlcHNNYXAuZ2V0KGtleSlcclxuICB0cmlnZ2VyRWZmZWN0KGRlcHNTZXQpXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyRWZmZWN0KGRlcHNTZXQ6IGFueSkge1xyXG4gIGNvbnN0IGVmZmVjdFRvUnVuID0gbmV3IFNldDxSZWFjdGl2ZUVmZmVjdD4oKVxyXG4gIGRlcHNTZXQgJiZcclxuICAgIGRlcHNTZXQuZm9yRWFjaCgoZWZmZWN0OiBSZWFjdGl2ZUVmZmVjdCkgPT4ge1xyXG4gICAgICBpZiAoYWN0aXZlRWZmZWN0ICE9PSBlZmZlY3QpIHtcclxuICAgICAgICBlZmZlY3RUb1J1bi5hZGQoZWZmZWN0KVxyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gIGVmZmVjdFRvUnVuLmZvckVhY2goKGVmZmVjdCkgPT4ge1xyXG4gICAgaWYgKGVmZmVjdC5zY2hlZHVsZXIpIHtcclxuICAgICAgZWZmZWN0LnNjaGVkdWxlcigpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBlZmZlY3QucnVuKClcclxuICAgIH1cclxuICB9KVxyXG59XHJcblxyXG50eXBlIE9wdGlvbnMgPSB7XHJcbiAgc2NoZWR1bGVyPzogRnVuY3Rpb25cclxuICBvblN0b3A/OiBGdW5jdGlvblxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZWZmZWN0KGZuOiBGdW5jdGlvbiwgb3B0aW9uczogT3B0aW9ucyA9IHt9KSB7XHJcbiAgY29uc3QgX2VmZmVjdCA9IG5ldyBSZWFjdGl2ZUVmZmVjdChmbiwgb3B0aW9ucy5zY2hlZHVsZXIpXHJcbiAgZXh0ZW5kKF9lZmZlY3QsIG9wdGlvbnMpXHJcblxyXG4gIF9lZmZlY3QucnVuKClcclxuICBjb25zdCBydW5uZXIgPSBfZWZmZWN0LnJ1bi5iaW5kKF9lZmZlY3QpXHJcbiAgOyhydW5uZXIgYXMgYW55KS5lZmZlY3QgPSBfZWZmZWN0XHJcbiAgcmV0dXJuIHJ1bm5lclxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc3RvcChydW5uZXI6IGFueSkge1xyXG4gIHJ1bm5lci5lZmZlY3Quc3RvcCgpXHJcbn1cclxuIiwiaW1wb3J0IHsgZXh0ZW5kLCBpc09iamVjdCB9IGZyb20gXCJAbWluLXZ1ZS9zaGFyZWRcIlxyXG5pbXBvcnQgeyB0cmFjaywgdHJpZ2dlciB9IGZyb20gXCIuL2VmZmVjdFwiXHJcbmltcG9ydCB7IFJlYWN0aXZlRmxhZ3MsIHJlYWN0aXZlLCByZWFkb25seSB9IGZyb20gXCIuL3JlYWN0aXZlXCJcclxuXHJcbmNvbnN0IGdldCA9IGNyZWF0ZUdldHRlcigpXHJcbmNvbnN0IHNldCA9IGNyZWF0ZVNldHRlcigpXHJcbmNvbnN0IHJlYWRvbmx5R2V0ID0gY3JlYXRlR2V0dGVyKHRydWUpXHJcbmNvbnN0IHNoYWxsb3dSZWFkb25seUdldCA9IGNyZWF0ZUdldHRlcih0cnVlLCB0cnVlKVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlR2V0dGVyKGlzUmVhZG9ubHk6IGJvb2xlYW4gPSBmYWxzZSwgc2hhbGxvdzogYm9vbGVhbiA9IGZhbHNlKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uIGdldCh0YXJnZXQsIGtleSwgcmVjZWl2ZXIpIHtcclxuICAgIGlmIChrZXkgPT09IFJlYWN0aXZlRmxhZ3MuSVNfUkVBQ1RJVkUpIHtcclxuICAgICAgcmV0dXJuICFpc1JlYWRvbmx5XHJcbiAgICB9IGVsc2UgaWYgKGtleSA9PT0gUmVhY3RpdmVGbGFncy5JU19SRUFET05MWSkge1xyXG4gICAgICByZXR1cm4gaXNSZWFkb25seVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHJlcyA9IFJlZmxlY3QuZ2V0KHRhcmdldCwga2V5LCByZWNlaXZlcilcclxuXHJcbiAgICBpZiAoc2hhbGxvdykge1xyXG4gICAgICByZXR1cm4gcmVzXHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFpc1JlYWRvbmx5KSB7XHJcbiAgICAgIHRyYWNrKHRhcmdldCwga2V5KVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChpc09iamVjdChyZXMpKSB7XHJcbiAgICAgIHJldHVybiBpc1JlYWRvbmx5ID8gcmVhZG9ubHkocmVzKSA6IHJlYWN0aXZlKHJlcylcclxuICAgIH1cclxuICAgIHJldHVybiByZXNcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVNldHRlcigpIHtcclxuICByZXR1cm4gZnVuY3Rpb24gc2V0KHRhcmdldCwga2V5LCBuZXdWYWx1ZSwgcmVjZWl2ZXIpIHtcclxuICAgIGNvbnN0IHJlcyA9IFJlZmxlY3Quc2V0KHRhcmdldCwga2V5LCBuZXdWYWx1ZSwgcmVjZWl2ZXIpXHJcbiAgICAvLyDop6blj5Hkvp3otZZcclxuICAgIHRyaWdnZXIodGFyZ2V0LCBrZXkpXHJcbiAgICByZXR1cm4gcmVzXHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgY29uc3QgbXV0YWJsZUhhbmRsZXJzID0ge1xyXG4gIGdldCxcclxuICBzZXQsXHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCByZWFkb25seUhhbmRsZXJzID0ge1xyXG4gIGdldDogcmVhZG9ubHlHZXQsXHJcbiAgc2V0KHRhcmdldCwga2V5LCBuZXdWYWx1ZSkge1xyXG4gICAgY29uc29sZS53YXJuKGByZWFkb25seSDkuI3og73kv67mlLk6IOiuvue9riAke3RhcmdldH0g5Lit55qEICR7a2V5feaXtmApXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG4gIH0sXHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBzaGFsbG93UmVhZG9ubHlIYW5kbGVycyA9IGV4dGVuZCh7fSwgcmVhZG9ubHlIYW5kbGVycywge1xyXG4gIGdldDogc2hhbGxvd1JlYWRvbmx5R2V0LFxyXG59KVxyXG4iLCJpbXBvcnQgeyBpc09iamVjdCB9IGZyb20gXCJAbWluLXZ1ZS9zaGFyZWRcIlxyXG5pbXBvcnQge1xyXG4gIG11dGFibGVIYW5kbGVycyxcclxuICByZWFkb25seUhhbmRsZXJzLFxyXG4gIHNoYWxsb3dSZWFkb25seUhhbmRsZXJzLFxyXG59IGZyb20gXCIuL2Jhc2VIYW5kbGVyXCJcclxuXHJcbmV4cG9ydCBjb25zdCBlbnVtIFJlYWN0aXZlRmxhZ3Mge1xyXG4gIElTX1JFQUNUSVZFID0gXCJfX3ZfaXNSZWFjdGl2ZVwiLFxyXG4gIElTX1JFQURPTkxZID0gXCJfX3ZfaXNSZWFkb25seVwiLFxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVhY3RpdmUocmF3KSB7XHJcbiAgcmV0dXJuIGNyZWF0ZUFjdGl2ZU9iamVjdChyYXcsIG11dGFibGVIYW5kbGVycylcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRvbmx5KHJhdykge1xyXG4gIHJldHVybiBjcmVhdGVBY3RpdmVPYmplY3QocmF3LCByZWFkb25seUhhbmRsZXJzKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2hhbGxvd1JlYWRvbmx5KHJhdykge1xyXG4gIHJldHVybiBjcmVhdGVBY3RpdmVPYmplY3QocmF3LCBzaGFsbG93UmVhZG9ubHlIYW5kbGVycylcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlQWN0aXZlT2JqZWN0KHRhcmdldCwgYmFzZUhhbmRsZXJzKSB7XHJcbiAgaWYgKCFpc09iamVjdCh0YXJnZXQpKSB7XHJcbiAgICBjb25zb2xlLndhcm4oYHRhcmdldCAke3RhcmdldH0g5b+F6aG75piv5LiA5Liq5a+56LGhYClcclxuICB9XHJcbiAgcmV0dXJuIG5ldyBQcm94eSh0YXJnZXQsIGJhc2VIYW5kbGVycylcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzUmVhY3RpdmUob2JzZXJ2ZWQpIHtcclxuICByZXR1cm4gISFvYnNlcnZlZFtSZWFjdGl2ZUZsYWdzLklTX1JFQUNUSVZFXVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNSZWFkb25seShvYnNlcnZlZCkge1xyXG4gIHJldHVybiAhIW9ic2VydmVkW1JlYWN0aXZlRmxhZ3MuSVNfUkVBRE9OTFldXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc1Byb3h5KHZhbHVlKSB7XHJcbiAgcmV0dXJuIGlzUmVhY3RpdmUodmFsdWUpIHx8IGlzUmVhZG9ubHkodmFsdWUpXHJcbn1cclxuIiwiaW1wb3J0IHsgaGFzQ2hhbmdlZCwgaXNBcnJheSwgaXNPYmplY3QgfSBmcm9tIFwiQG1pbi12dWUvc2hhcmVkXCJcclxuaW1wb3J0IHsgdHJhY2tFZmZlY3QsIHRyaWdnZXJFZmZlY3QgfSBmcm9tIFwiLi9lZmZlY3RcIlxyXG5pbXBvcnQgeyByZWFjdGl2ZSB9IGZyb20gXCIuL3JlYWN0aXZlXCJcclxuXHJcbmNsYXNzIFJlZkltcGwge1xyXG4gIHByaXZhdGUgX3ZhbHVlOiBhbnlcclxuICBwcml2YXRlIGRlcHNTZXRcclxuICBwcml2YXRlIF9yb3dWYWx1ZTogYW55XHJcbiAgcHVibGljIF9fdl9pc1JlZiA9IHRydWVcclxuICBjb25zdHJ1Y3Rvcih2YWx1ZSkge1xyXG4gICAgdGhpcy5fdmFsdWUgPSBjb252ZXJ0KHZhbHVlKVxyXG4gICAgdGhpcy5fcm93VmFsdWUgPSB2YWx1ZVxyXG4gICAgdGhpcy5kZXBzU2V0ID0gbmV3IFNldCgpXHJcbiAgfVxyXG5cclxuICBnZXQgdmFsdWUoKTogYW55IHtcclxuICAgIHRyYWNrRWZmZWN0KHRoaXMuZGVwc1NldClcclxuICAgIHJldHVybiB0aGlzLl92YWx1ZVxyXG4gIH1cclxuXHJcbiAgc2V0IHZhbHVlKG5ld1ZhbHVlOiBhbnkpIHtcclxuICAgIGlmIChoYXNDaGFuZ2VkKHRoaXMuX3Jvd1ZhbHVlLCBuZXdWYWx1ZSkpIHtcclxuICAgICAgdGhpcy5fdmFsdWUgPSBjb252ZXJ0KG5ld1ZhbHVlKVxyXG4gICAgICB0aGlzLl9yb3dWYWx1ZSA9IG5ld1ZhbHVlXHJcbiAgICAgIHRyaWdnZXJFZmZlY3QodGhpcy5kZXBzU2V0KVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY29udmVydCh2YWx1ZSkge1xyXG4gIHJldHVybiBpc09iamVjdCh2YWx1ZSkgPyByZWFjdGl2ZSh2YWx1ZSkgOiB2YWx1ZVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVmKHZhbHVlKSB7XHJcbiAgcmV0dXJuIG5ldyBSZWZJbXBsKHZhbHVlKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNSZWYocmVmKSB7XHJcbiAgcmV0dXJuICEhcmVmLl9fdl9pc1JlZlxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdW5SZWYocmVmKSB7XHJcbiAgcmV0dXJuIGlzUmVmKHJlZikgPyByZWYudmFsdWUgOiByZWZcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHByb3h5UmVmcyhvYmplY3RXaXRoUmVmcykge1xyXG4gIHJldHVybiBuZXcgUHJveHkob2JqZWN0V2l0aFJlZnMsIHtcclxuICAgIGdldCh0YXJnZXQsIGtleSwgcmVjZWl2ZXIpIHtcclxuICAgICAgcmV0dXJuIHVuUmVmKFJlZmxlY3QuZ2V0KHRhcmdldCwga2V5LCByZWNlaXZlcikpXHJcbiAgICB9LFxyXG4gICAgc2V0KHRhcmdldCwga2V5LCBuZXdWYWx1ZSwgcmVjZWl2ZXIpIHtcclxuICAgICAgaWYgKGlzUmVmKHRhcmdldFtrZXldKSAmJiAhaXNSZWYobmV3VmFsdWUpKSB7XHJcbiAgICAgICAgcmV0dXJuICh0YXJnZXRba2V5XS52YWx1ZSA9IG5ld1ZhbHVlKVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiBSZWZsZWN0LnNldCh0YXJnZXQsIGtleSwgbmV3VmFsdWUsIHJlY2VpdmVyKVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gIH0pXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0b1JlZjxUPih2YWx1ZTogVClcclxuZXhwb3J0IGZ1bmN0aW9uIHRvUmVmPFQgZXh0ZW5kcyBvYmplY3QsIEsgZXh0ZW5kcyBrZXlvZiBUPihcclxuICBzb3VyY2U6IFQsXHJcbiAga2V5PzogSyxcclxuICBkZWZhdWx0VmFsdWU/OiB1bmtub3duXHJcbilcclxuZXhwb3J0IGZ1bmN0aW9uIHRvUmVmPFQgZXh0ZW5kcyBvYmplY3QsIEsgZXh0ZW5kcyBrZXlvZiBUPihcclxuICBzb3VyY2U6IFQsXHJcbiAga2V5PzogSyxcclxuICBkZWZhdWx0VmFsdWU/OiB1bmtub3duXHJcbikge1xyXG4gIGlmIChpc1JlZihzb3VyY2UpKSB7XHJcbiAgICByZXR1cm4gc291cmNlXHJcbiAgfSBlbHNlIGlmIChpc09iamVjdChzb3VyY2UpICYmIGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XHJcbiAgICByZXR1cm4gcHJvcGVydHlUb1JlZihzb3VyY2UsIGtleSEsIGRlZmF1bHRWYWx1ZSlcclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuIHJlZihzb3VyY2UpXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBwcm9wZXJ0eVRvUmVmKFxyXG4gIHNvdXJjZTogUmVjb3JkPHN0cmluZywgYW55PixcclxuICBrZXk6IGFueSxcclxuICBkZWZhdWx0VmFsdWU/OiB1bmtub3duXHJcbikge1xyXG4gIGNvbnN0IHZhbCA9IHNvdXJjZVtrZXldXHJcbiAgcmV0dXJuIGlzUmVmKHZhbCkgPyB2YWwgOiBuZXcgT2JqZWN0UmVmSW1wbChzb3VyY2UsIGtleSwgZGVmYXVsdFZhbHVlKVxyXG59XHJcblxyXG5jbGFzcyBPYmplY3RSZWZJbXBsPFQgZXh0ZW5kcyBvYmplY3QsIEsgZXh0ZW5kcyBrZXlvZiBUPiB7XHJcbiAgcHVibGljIHJlYWRvbmx5IF9fdl9pc1JlZiA9IHRydWVcclxuXHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9vYmplY3Q6IFQsXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9rZXk6IEssXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0VmFsdWU/OiBUW0tdXHJcbiAgKSB7fVxyXG5cclxuICBnZXQgdmFsdWUoKSB7XHJcbiAgICBjb25zdCB2YWwgPSB0aGlzLl9vYmplY3RbdGhpcy5fa2V5XVxyXG4gICAgcmV0dXJuIHZhbCA9PT0gdW5kZWZpbmVkID8gdGhpcy5fZGVmYXVsdFZhbHVlISA6IHZhbFxyXG4gIH1cclxuXHJcbiAgc2V0IHZhbHVlKG5ld1ZhbCkge1xyXG4gICAgdGhpcy5fb2JqZWN0W3RoaXMuX2tleV0gPSBuZXdWYWxcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0b1JlZnM8VCBleHRlbmRzIG9iamVjdD4ob2JqZWN0OiBUKSB7XHJcbiAgY29uc3QgcmV0OiBhbnkgPSBpc0FycmF5KG9iamVjdCkgPyBuZXcgQXJyYXkoKG9iamVjdCBhcyBhbnlbXSkubGVuZ3RoKSA6IHt9XHJcbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XHJcbiAgICByZXRba2V5XSA9IHByb3BlcnR5VG9SZWYob2JqZWN0LCBrZXkpXHJcbiAgfVxyXG4gIHJldHVybiByZXRcclxufVxyXG4iLCJpbXBvcnQgeyBSZWFjdGl2ZUVmZmVjdCB9IGZyb20gXCIuL2VmZmVjdFwiXHJcblxyXG5jbGFzcyBDb21wdXRlZFJlZkltcGwge1xyXG4gIHByaXZhdGUgX2RpcnR5OiBib29sZWFuID0gdHJ1ZVxyXG4gIHByaXZhdGUgX3ZhbHVlOiBhbnlcclxuICBwcml2YXRlIF9lZmZlY3Q6IFJlYWN0aXZlRWZmZWN0XHJcblxyXG4gIGNvbnN0cnVjdG9yKGdldHRlcjogRnVuY3Rpb24pIHtcclxuICAgIHRoaXMuX2VmZmVjdCA9IG5ldyBSZWFjdGl2ZUVmZmVjdChnZXR0ZXIsICgpID0+IHtcclxuICAgICAgaWYgKCF0aGlzLl9kaXJ0eSkge1xyXG4gICAgICAgIHRoaXMuX2RpcnR5ID0gdHJ1ZVxyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgZ2V0IHZhbHVlKCk6IGFueSB7XHJcbiAgICBpZiAodGhpcy5fZGlydHkpIHtcclxuICAgICAgdGhpcy5fZGlydHkgPSBmYWxzZVxyXG4gICAgICB0aGlzLl92YWx1ZSA9IHRoaXMuX2VmZmVjdC5ydW4oKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuX3ZhbHVlXHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZWQoZ2V0dGVyKSB7XHJcbiAgcmV0dXJuIG5ldyBDb21wdXRlZFJlZkltcGwoZ2V0dGVyKVxyXG59XHJcbiIsImltcG9ydCB7IGNhbWVsaXplLCB0b0hhbmRsZXJLZXkgfSBmcm9tIFwiQG1pbi12dWUvc2hhcmVkXCJcclxuaW1wb3J0IHsgQ29tcG9uZW50SW5zdGFuY2UgfSBmcm9tIFwiLi9jb21wb25lbnRcIlxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGVtaXQoaW5zdGFuY2U6IENvbXBvbmVudEluc3RhbmNlLCBldmVudDogc3RyaW5nLCAuLi5hcmdzKSB7XHJcbiAgY29uc3QgeyBwcm9wcyB9ID0gaW5zdGFuY2VcclxuXHJcbiAgY29uc3QgaGFuZGxlck5hbWUgPSB0b0hhbmRsZXJLZXkoY2FtZWxpemUoZXZlbnQpKVxyXG4gIGNvbnN0IGhhbmRsZXIgPSBwcm9wc1toYW5kbGVyTmFtZV1cclxuICBoYW5kbGVyICYmIGhhbmRsZXIoLi4uYXJncylcclxufVxyXG4iLCJpbXBvcnQgeyBDb21wb25lbnRJbnN0YW5jZSB9IGZyb20gXCIuL2NvbXBvbmVudFwiXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaW5pdFByb3BzKGluc3RhbmNlOiBDb21wb25lbnRJbnN0YW5jZSwgcmF3UHJvcHM6IG9iamVjdCkge1xyXG4gIGluc3RhbmNlLnByb3BzID0gcmF3UHJvcHNcclxufVxyXG4iLCJpbXBvcnQgeyBoYXNPd24gfSBmcm9tIFwiQG1pbi12dWUvc2hhcmVkXCJcclxuXHJcbmNvbnN0IHB1YmxpY1Byb3BlcnRpZXNNYXAgPSB7XHJcbiAgJGVsOiAoaSkgPT4gaS52bm9kZS5lbCxcclxuICAkc2xvdHM6IChpKSA9PiBpLnNsb3RzLFxyXG4gICRwcm9wczogKGkpID0+IGkucHJvcHMsXHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBQdWJsaWNJbnN0YW5jZVByb3h5SGFuZGxlcnMgPSB7XHJcbiAgZ2V0KHsgXzogaW5zdGFuY2UgfSwga2V5KSB7XHJcbiAgICBjb25zdCB7IHNldHVwU3RhdGUsIHByb3BzIH0gPSBpbnN0YW5jZVxyXG5cclxuICAgIGlmIChoYXNPd24oc2V0dXBTdGF0ZSwga2V5KSkge1xyXG4gICAgICByZXR1cm4gc2V0dXBTdGF0ZSFba2V5XVxyXG4gICAgfSBlbHNlIGlmIChoYXNPd24ocHJvcHMsIGtleSkpIHtcclxuICAgICAgcmV0dXJuIHByb3BzW2tleV1cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBwdWJsaWNHZXR0ZXIgPSBwdWJsaWNQcm9wZXJ0aWVzTWFwW2tleV1cclxuICAgIHJldHVybiBwdWJsaWNHZXR0ZXIgJiYgcHVibGljR2V0dGVyKGluc3RhbmNlKVxyXG4gIH0sXHJcbn1cclxuIiwiaW1wb3J0IHsgQ29tcG9uZW50SW5zdGFuY2UgfSBmcm9tIFwiLi9jb21wb25lbnRcIlxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGluaXRTbG90cyhcclxuICBpbnN0YW5jZTogQ29tcG9uZW50SW5zdGFuY2UsXHJcbiAgY2hpbGRyZW46IGFueVtdIHwgb2JqZWN0XHJcbikge1xyXG4gIC8vIGFycmF5IG9yIG9iamVjdFxyXG4gIC8vIGluc3RhbmNlLnNsb3RzID0gQXJyYXkuaXNBcnJheShjaGlsZHJlbikgPyBjaGlsZHJlbiA6IFtjaGlsZHJlbl1cclxuXHJcbiAgY29uc3Qgc2xvdHMgPSB7fVxyXG4gIGZvciAoY29uc3Qga2V5IGluIGNoaWxkcmVuKSB7XHJcbiAgICBjb25zdCB2YWx1ZSA9IGNoaWxkcmVuW2tleV1cclxuICAgIHNsb3RzW2tleV0gPSBBcnJheS5pc0FycmF5KHZhbHVlKVxyXG4gICAgICA/IHZhbHVlXHJcbiAgICAgIDogdHlwZW9mIHZhbHVlID09PSBcImZ1bmN0aW9uXCJcclxuICAgICAgPyB2YWx1ZVxyXG4gICAgICA6IFt2YWx1ZV1cclxuICB9XHJcbiAgaW5zdGFuY2Uuc2xvdHMgPSBzbG90c1xyXG59XHJcbiIsImltcG9ydCB7IHByb3h5UmVmcyB9IGZyb20gXCJAbWluLXZ1ZS9yZWFjdGl2aXR5XCJcclxuaW1wb3J0IHsgc2hhbGxvd1JlYWRvbmx5IH0gZnJvbSBcIkBtaW4tdnVlL3JlYWN0aXZpdHlcIlxyXG5pbXBvcnQgeyBlbWl0IH0gZnJvbSBcIi4vY29tcG9uZW50RW1pdFwiXHJcbmltcG9ydCB7IGluaXRQcm9wcyB9IGZyb20gXCIuL2NvbXBvbmVudFByb3BzXCJcclxuaW1wb3J0IHsgUHVibGljSW5zdGFuY2VQcm94eUhhbmRsZXJzIH0gZnJvbSBcIi4vY29tcG9uZW50UHVibGljSW5zdGFuY2VcIlxyXG5pbXBvcnQgeyBpbml0U2xvdHMgfSBmcm9tIFwiLi9jb21wb25lbnRTbG90c1wiXHJcbmltcG9ydCB7IENvbXBvbmVudCB9IGZyb20gXCIuL2hcIlxyXG5pbXBvcnQgeyBWTm9kZSB9IGZyb20gXCIuL3Zub2RlXCJcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQ29tcG9uZW50SW5zdGFuY2Uge1xyXG4gIHZub2RlOiBWTm9kZVxyXG4gIHR5cGU6IFZOb2RlW1widHlwZVwiXVxyXG4gIHByb3BzOiBvYmplY3RcclxuICBlbWl0OiBGdW5jdGlvblxyXG4gIHNsb3RzOiBvYmplY3RcclxuICBwcm92aWRlcz86IG9iamVjdFxyXG4gIHBhcmVudD86IENvbXBvbmVudEluc3RhbmNlXHJcbiAgc2V0dXBTdGF0ZT86IG9iamVjdFxyXG4gIHJlbmRlcj86IENvbXBvbmVudFtcInJlbmRlclwiXVxyXG4gIHByb3h5PzogYW55XHJcbiAgaXNNb3VudGVkOiBib29sZWFuXHJcbiAgc3ViVHJlZTogVk5vZGUgfCBudWxsXHJcbiAgdXBkYXRlPzogRnVuY3Rpb24gfCBudWxsXHJcbiAgbmV4dD86IFZOb2RlXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDb21wb25lbnRJbnN0YW5jZShcclxuICB2bm9kZTogVk5vZGUsXHJcbiAgcGFyZW50PzogQ29tcG9uZW50SW5zdGFuY2VcclxuKTogQ29tcG9uZW50SW5zdGFuY2Uge1xyXG4gIGNvbnN0IGNvbXBvbmVudDogQ29tcG9uZW50SW5zdGFuY2UgPSB7XHJcbiAgICB2bm9kZSxcclxuICAgIHByb3BzOiB7fSxcclxuICAgIGVtaXQ6ICgpOiB2b2lkID0+IHt9LFxyXG4gICAgc2xvdHM6IHt9LFxyXG4gICAgcHJvdmlkZXM6IHBhcmVudCA/IHBhcmVudC5wcm92aWRlcyA6IHt9LFxyXG4gICAgcGFyZW50LFxyXG4gICAgdHlwZTogdm5vZGUudHlwZSxcclxuICAgIHNldHVwU3RhdGU6IHt9LFxyXG4gICAgaXNNb3VudGVkOiBmYWxzZSxcclxuICAgIHN1YlRyZWU6IG51bGwsXHJcbiAgfVxyXG5cclxuICBjb21wb25lbnQuZW1pdCA9IGVtaXQuYmluZChudWxsLCBjb21wb25lbnQpXHJcblxyXG4gIHJldHVybiBjb21wb25lbnRcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwQ29tcG9uZW50KGluc3RhbmNlOiBDb21wb25lbnRJbnN0YW5jZSkge1xyXG4gIGluaXRQcm9wcyhpbnN0YW5jZSwgaW5zdGFuY2Uudm5vZGUucHJvcHMpXHJcbiAgaW5pdFNsb3RzKGluc3RhbmNlLCBpbnN0YW5jZS52bm9kZS5jaGlsZHJlbiBhcyBhbnkpXHJcblxyXG4gIHNldHVwU3RhdGVmdWxDb21wb25lbnQoaW5zdGFuY2UpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwU3RhdGVmdWxDb21wb25lbnQoaW5zdGFuY2U6IENvbXBvbmVudEluc3RhbmNlKSB7XHJcbiAgY29uc3QgQ29tcG9uZW50ID0gaW5zdGFuY2UudHlwZSBhcyBDb21wb25lbnRcclxuXHJcbiAgaW5zdGFuY2UucHJveHkgPSBuZXcgUHJveHkoeyBfOiBpbnN0YW5jZSB9LCBQdWJsaWNJbnN0YW5jZVByb3h5SGFuZGxlcnMpXHJcblxyXG4gIGNvbnN0IHsgc2V0dXAgfSA9IENvbXBvbmVudFxyXG5cclxuICBpZiAoc2V0dXApIHtcclxuICAgIHNldEN1cnJlbnRJbnN0YW5jZShpbnN0YW5jZSlcclxuICAgIC8vIHNldHVw5Y+v5Lul6L+U5Zue5LiA5Liq5a+56LGh5oiW6ICF5riy5p+T5Ye95pWwXHJcbiAgICBjb25zdCBzZXR1cFJlc3VsdCA9IHByb3h5UmVmcyhcclxuICAgICAgc2V0dXAoc2hhbGxvd1JlYWRvbmx5KGluc3RhbmNlLnByb3BzKSwge1xyXG4gICAgICAgIGVtaXQ6IGluc3RhbmNlLmVtaXQsXHJcbiAgICAgIH0pXHJcbiAgICApXHJcbiAgICBzZXRDdXJyZW50SW5zdGFuY2UobnVsbClcclxuXHJcbiAgICBoYW5kbGVTZXR1cFJlc3VsdChpbnN0YW5jZSwgc2V0dXBSZXN1bHQpXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBoYW5kbGVTZXR1cFJlc3VsdChpbnN0YW5jZTogQ29tcG9uZW50SW5zdGFuY2UsIHNldHVwUmVzdWx0OiBvYmplY3QpIHtcclxuICBpZiAodHlwZW9mIHNldHVwUmVzdWx0ID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICBpbnN0YW5jZS5zZXR1cFN0YXRlID0gc2V0dXBSZXN1bHRcclxuICB9XHJcblxyXG4gIGZpbmlzaENvbXBvbmVudFNldHVwKGluc3RhbmNlKVxyXG59XHJcblxyXG5mdW5jdGlvbiBmaW5pc2hDb21wb25lbnRTZXR1cChpbnN0YW5jZTogQ29tcG9uZW50SW5zdGFuY2UpIHtcclxuICBjb25zdCBDb21wb25lbnQgPSBpbnN0YW5jZS50eXBlIGFzIENvbXBvbmVudFxyXG4gIGlmIChjb21waWxlciAmJiAhQ29tcG9uZW50LnJlbmRlcikge1xyXG4gICAgaWYgKENvbXBvbmVudC50ZW1wbGF0ZSkge1xyXG4gICAgICBDb21wb25lbnQucmVuZGVyID0gY29tcGlsZXIoQ29tcG9uZW50LnRlbXBsYXRlKVxyXG4gICAgfVxyXG4gIH1cclxuICBpbnN0YW5jZS5yZW5kZXIgPSBDb21wb25lbnQucmVuZGVyXHJcbn1cclxuXHJcbmxldCBjdXJyZW50SW5zdGFuY2U6IG51bGwgfCBDb21wb25lbnRJbnN0YW5jZSA9IG51bGxcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRDdXJyZW50SW5zdGFuY2UoKSB7XHJcbiAgcmV0dXJuIGN1cnJlbnRJbnN0YW5jZVxyXG59XHJcblxyXG5mdW5jdGlvbiBzZXRDdXJyZW50SW5zdGFuY2UoaW5zdGFuY2U6IENvbXBvbmVudEluc3RhbmNlIHwgbnVsbCkge1xyXG4gIGN1cnJlbnRJbnN0YW5jZSA9IGluc3RhbmNlXHJcbn1cclxuXHJcbmxldCBjb21waWxlclxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyUnVudGltZUNvbXBpbGVyKF9jb21waWxlcikge1xyXG4gIGNvbXBpbGVyID0gX2NvbXBpbGVyXHJcbn1cclxuIiwiaW1wb3J0IHsgVk5vZGUgfSBmcm9tIFwiLi92bm9kZVwiXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkVXBkYXRlQ29tcG9uZW50KG5ld1ZOb2RlOiBWTm9kZSwgb2xkVk5vZGU6IFZOb2RlIHwgbnVsbCkge1xyXG4gIGNvbnN0IHsgcHJvcHM6IG9sZFByb3BzIH0gPSBvbGRWTm9kZSB8fCB7fVxyXG4gIGNvbnN0IHsgcHJvcHM6IG5ld1Byb3BzIH0gPSBuZXdWTm9kZVxyXG5cclxuICBmb3IgKGNvbnN0IGtleSBpbiBuZXdQcm9wcykge1xyXG4gICAgaWYgKG5ld1Byb3BzW2tleV0gIT09IG9sZFByb3BzPy5ba2V5XSkge1xyXG4gICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gZmFsc2VcclxufVxyXG4iLCJpbXBvcnQgeyBDb21wb25lbnRJbnN0YW5jZSB9IGZyb20gXCIuL2NvbXBvbmVudFwiXHJcbmltcG9ydCB7IENvbXBvbmVudCB9IGZyb20gXCIuL2hcIlxyXG5cclxuZXhwb3J0IGNvbnN0IFRleHQgPSBTeW1ib2woXCJUZXh0XCIpXHJcbmV4cG9ydCBpbnRlcmZhY2UgVk5vZGUge1xyXG4gIHR5cGU6IHN0cmluZyB8IENvbXBvbmVudCB8IFN5bWJvbFxyXG4gIHByb3BzOiBvYmplY3RcclxuICBjaGlsZHJlbjogVk5vZGVbXSB8IHN0cmluZ1xyXG4gIGNvbXBvbmVudD86IENvbXBvbmVudEluc3RhbmNlIHwgbnVsbFxyXG4gIGVsOiBFbGVtZW50IHwgbnVsbFxyXG4gIGtleT86IHN0cmluZ1xyXG59XHJcblxyXG5leHBvcnQgeyBjcmVhdGVWTm9kZSBhcyBjcmVhdGVFbGVtZW50Vk5vZGUgfVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVZOb2RlKFxyXG4gIHR5cGU6IHN0cmluZyB8IENvbXBvbmVudCB8IFN5bWJvbCxcclxuICBwcm9wcz86IGFueSxcclxuICBjaGlsZHJlbj86IFZOb2RlW10gfCBzdHJpbmdcclxuKTogVk5vZGUge1xyXG4gIGNvbnN0IHZub2RlOiBWTm9kZSA9IHtcclxuICAgIHR5cGUsXHJcbiAgICBwcm9wczogcHJvcHMgfHwge30sXHJcbiAgICBjaGlsZHJlbjogY2hpbGRyZW4gfHwgW10sXHJcbiAgICBjb21wb25lbnQ6IG51bGwsXHJcbiAgICBlbDogbnVsbCxcclxuICAgIGtleTogcHJvcHM/LmtleSxcclxuICB9XHJcblxyXG4gIHJldHVybiB2bm9kZVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGV4dFZOb2RlKGNvbnRlbnQ6IHN0cmluZykge1xyXG4gIHJldHVybiBjcmVhdGVWTm9kZShUZXh0LCB7fSwgY29udGVudClcclxufVxyXG4iLCJpbXBvcnQgeyBjb252ZXJ0U3RyaW5nVG9IVE1MRWxlbWVudCB9IGZyb20gXCJAbWluLXZ1ZS9zaGFyZWRcIlxyXG5pbXBvcnQgeyBDb21wb25lbnQgfSBmcm9tIFwiLi9oXCJcclxuaW1wb3J0IHsgY3JlYXRlVk5vZGUgfSBmcm9tIFwiLi92bm9kZVwiXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQXBwQVBJKHJlbmRlcikge1xyXG4gIHJldHVybiBmdW5jdGlvbiBjcmVhdGVBcHAocm9vdENvbXBvbmVudDogQ29tcG9uZW50KSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBtb3VudChfcm9vdENvbnRhaW5lcjogc3RyaW5nIHwgRWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IHZub2RlID0gY3JlYXRlVk5vZGUocm9vdENvbXBvbmVudClcclxuICAgICAgICBjb25zdCByb290Q29udGFpbmVyID0gY29udmVydFN0cmluZ1RvSFRNTEVsZW1lbnQoX3Jvb3RDb250YWluZXIpXHJcbiAgICAgICAgcmVuZGVyKHZub2RlLCByb290Q29udGFpbmVyKVxyXG4gICAgICB9LFxyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iLCJjb25zdCBxdWV1ZTogYW55W10gPSBbXVxyXG5cclxuY29uc3QgcCA9IFByb21pc2UucmVzb2x2ZSgpXHJcbmxldCBpc0ZsdXNoUGVuZGluZyA9IGZhbHNlXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcclxuICByZXR1cm4gZm4gPyBwLnRoZW4oZm4pIDogcFxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcXVldWVKb2JzKGpvYikge1xyXG4gIGlmICghcXVldWUuaW5jbHVkZXMoam9iKSkge1xyXG4gICAgcXVldWUucHVzaChqb2IpXHJcbiAgfVxyXG5cclxuICBxdWV1ZUZsdXNoKClcclxufVxyXG5cclxuZnVuY3Rpb24gcXVldWVGbHVzaCgpIHtcclxuICBpZiAoaXNGbHVzaFBlbmRpbmcpIHJldHVyblxyXG4gIGlzRmx1c2hQZW5kaW5nID0gdHJ1ZVxyXG5cclxuICBuZXh0VGljayhmbHVzaEpvYnMpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZsdXNoSm9icygpIHtcclxuICBsZXQgam9iXHJcbiAgaXNGbHVzaFBlbmRpbmcgPSBmYWxzZVxyXG4gIHdoaWxlICgoam9iID0gcXVldWUuc2hpZnQoKSkpIHtcclxuICAgIGpvYiAmJiBqb2IoKVxyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgeyBlZmZlY3QgfSBmcm9tIFwiQG1pbi12dWUvcmVhY3Rpdml0eVwiXHJcbmltcG9ydCB7IGlzQXJyYXksIGlzT2JqZWN0LCBpc1N0cmluZyB9IGZyb20gXCJAbWluLXZ1ZS9zaGFyZWRcIlxyXG5pbXBvcnQge1xyXG4gIENvbXBvbmVudEluc3RhbmNlLFxyXG4gIGNyZWF0ZUNvbXBvbmVudEluc3RhbmNlLFxyXG4gIHNldHVwQ29tcG9uZW50LFxyXG59IGZyb20gXCIuL2NvbXBvbmVudFwiXHJcbmltcG9ydCB7IHNob3VsZFVwZGF0ZUNvbXBvbmVudCB9IGZyb20gXCIuL2NvbXBvbmVudFVwZGF0ZVV0aWxzXCJcclxuaW1wb3J0IHsgY3JlYXRlQXBwQVBJIH0gZnJvbSBcIi4vY3JlYXRlQXBwXCJcclxuaW1wb3J0IHsgcXVldWVKb2JzIH0gZnJvbSBcIi4vc2NoZWR1bGVyXCJcclxuaW1wb3J0IHsgVGV4dCwgVk5vZGUgfSBmcm9tIFwiLi92bm9kZVwiXHJcblxyXG5leHBvcnQgY29uc3QgRnJhZ21lbnQgPSBTeW1ib2woXCJGcmFnbWVudFwiKVxyXG5cclxuaW50ZXJmYWNlIE9wdGlvbnMge1xyXG4gIGNyZWF0ZUVsZW1lbnQ6ICh0eXBlOiBzdHJpbmcpID0+IGFueVxyXG4gIHBhdGNoUHJvcDogKGVsOiBhbnksIGtleTogc3RyaW5nLCBvbGRWYWx1ZTogYW55LCBuZXdWYWx1ZTogYW55KSA9PiB2b2lkXHJcbiAgaW5zZXJ0OiAoZWw6IGFueSwgY29udGFpbmVyOiBhbnksIGFuY2hvcjogYW55KSA9PiB2b2lkXHJcbiAgY3JlYXRlVGV4dE5vZGU6IChjb250ZW50OiBzdHJpbmcpID0+IGFueVxyXG4gIHJlbW92ZTogKGNoaWxkOiBhbnkpID0+IGFueVxyXG4gIHNldEVsZW1lbnRUZXh0OiAoZWwsIHRleHQpID0+IGFueVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUmVuZGVyZXIob3B0aW9uczogT3B0aW9ucykge1xyXG4gIGNvbnN0IHtcclxuICAgIGNyZWF0ZUVsZW1lbnQ6IGhvc3RDcmVhdGVFbGVtZW50LFxyXG4gICAgcGF0Y2hQcm9wOiBob3N0UGF0Y2hQcm9wLFxyXG4gICAgaW5zZXJ0OiBob3N0SW5zZXJ0LFxyXG4gICAgY3JlYXRlVGV4dE5vZGU6IGhvc3RDcmVhdGVUZXh0Tm9kZSxcclxuICAgIHJlbW92ZTogaG9zdFJlbW92ZSxcclxuICAgIHNldEVsZW1lbnRUZXh0OiBob3N0U2V0RWxlbWVudFRleHQsXHJcbiAgfSA9IG9wdGlvbnNcclxuXHJcbiAgZnVuY3Rpb24gcmVuZGVyKHZub2RlOiBWTm9kZSwgY29udGFpbmVyOiBFbGVtZW50KSB7XHJcbiAgICBwYXRjaCh2bm9kZSwgbnVsbCwgY29udGFpbmVyLCB1bmRlZmluZWQsIG51bGwgYXMgYW55KVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcGF0Y2goXHJcbiAgICBuZXdWTm9kZTogVk5vZGUsXHJcbiAgICBwcmVWTm9kZTogVk5vZGUgfCBudWxsLFxyXG4gICAgY29udGFpbmVyOiBFbGVtZW50LFxyXG4gICAgcGFyZW50Q29tcG9uZW50PzogQ29tcG9uZW50SW5zdGFuY2UsXHJcbiAgICBhbmNob3I/OiBFbGVtZW50XHJcbiAgKSB7XHJcbiAgICBzd2l0Y2ggKG5ld1ZOb2RlLnR5cGUpIHtcclxuICAgICAgY2FzZSBGcmFnbWVudDpcclxuICAgICAgICBwcm9jZXNzRnJhZ21lbnQobmV3Vk5vZGUsIHByZVZOb2RlLCBjb250YWluZXIsIHBhcmVudENvbXBvbmVudClcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlIFRleHQ6XHJcbiAgICAgICAgcHJvY2Vzc1RleHQobmV3Vk5vZGUsIHByZVZOb2RlLCBjb250YWluZXIsIGFuY2hvcilcclxuICAgICAgICBicmVha1xyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIGlmICh0eXBlb2YgbmV3Vk5vZGUudHlwZSA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgLy8g5aSE55CG57uE5Lu2XHJcbiAgICAgICAgICBwcm9jZXNzRWxlbWVudChuZXdWTm9kZSwgcHJlVk5vZGUsIGNvbnRhaW5lciwgcGFyZW50Q29tcG9uZW50LCBhbmNob3IpXHJcbiAgICAgICAgfSBlbHNlIGlmIChpc09iamVjdChuZXdWTm9kZS50eXBlKSkge1xyXG4gICAgICAgICAgcHJvY2Vzc0NvbXBvbmVudChuZXdWTm9kZSwgcHJlVk5vZGUsIGNvbnRhaW5lciwgcGFyZW50Q29tcG9uZW50KVxyXG4gICAgICAgIH1cclxuICAgICAgICBicmVha1xyXG4gICAgfVxyXG4gIH1cclxuICBmdW5jdGlvbiBwcm9jZXNzVGV4dChcclxuICAgIG5ld1ZOb2RlOiBWTm9kZSxcclxuICAgIHByZVZOb2RlOiBWTm9kZSB8IG51bGwsXHJcbiAgICBjb250YWluZXI6IEVsZW1lbnQsXHJcbiAgICBhbmNob3I/OiBFbGVtZW50XHJcbiAgKSB7XHJcbiAgICBjb25zdCB7IGNoaWxkcmVuIH0gPSBuZXdWTm9kZVxyXG4gICAgY29uc3QgdGV4dE5vZGUgPSAobmV3Vk5vZGUuZWwgPSBob3N0Q3JlYXRlVGV4dE5vZGUoXHJcbiAgICAgIGNoaWxkcmVuIGFzIHN0cmluZ1xyXG4gICAgKSBhcyBhbnkpXHJcbiAgICBob3N0SW5zZXJ0KHRleHROb2RlLCBjb250YWluZXIsIGFuY2hvcilcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHByb2Nlc3NGcmFnbWVudChcclxuICAgIG5ld1ZOb2RlOiBWTm9kZSxcclxuICAgIHByZVZOb2RlOiBWTm9kZSB8IG51bGwsXHJcbiAgICBjb250YWluZXI6IEVsZW1lbnQsXHJcbiAgICBwYXJlbnRDb21wb25lbnQ/OiBDb21wb25lbnRJbnN0YW5jZSxcclxuICAgIGFuY2hvcj86IEVsZW1lbnRcclxuICApIHtcclxuICAgIGlmICh0eXBlb2YgbmV3Vk5vZGUuY2hpbGRyZW4gPT09IFwic3RyaW5nXCIpIHJldHVyblxyXG4gICAgbmV3Vk5vZGUuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQpID0+XHJcbiAgICAgIHBhdGNoKGNoaWxkLCBudWxsLCBjb250YWluZXIsIHBhcmVudENvbXBvbmVudCwgYW5jaG9yKVxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcHJvY2Vzc0VsZW1lbnQoXHJcbiAgICBuZXdWTm9kZTogVk5vZGUsXHJcbiAgICBwcmVWTm9kZTogVk5vZGUgfCBudWxsLFxyXG4gICAgY29udGFpbmVyOiBFbGVtZW50LFxyXG4gICAgcGFyZW50Q29tcG9uZW50PzogQ29tcG9uZW50SW5zdGFuY2UsXHJcbiAgICBhbmNob3I/OiBFbGVtZW50XHJcbiAgKSB7XHJcbiAgICBpZiAoIXByZVZOb2RlKSB7XHJcbiAgICAgIG1vdW50RWxlbWVudChuZXdWTm9kZSwgY29udGFpbmVyLCBwYXJlbnRDb21wb25lbnQsIGFuY2hvcilcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHBhdGNoRWxlbWVudChuZXdWTm9kZSwgcHJlVk5vZGUsIHBhcmVudENvbXBvbmVudCwgYW5jaG9yKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcGF0Y2hFbGVtZW50KFxyXG4gICAgbmV3Vk5vZGU6IFZOb2RlLFxyXG4gICAgcHJlVk5vZGU6IFZOb2RlLFxyXG4gICAgcGFyZW50Q29tcG9uZW50PzogQ29tcG9uZW50SW5zdGFuY2UsXHJcbiAgICBhbmNob3I/OiBFbGVtZW50XHJcbiAgKSB7XHJcbiAgICBjb25zdCBvbGRQcm9wcyA9IHByZVZOb2RlLnByb3BzIHx8IEVNUFRZX09CSlxyXG4gICAgY29uc3QgbmV3UHJvcHMgPSBuZXdWTm9kZS5wcm9wcyB8fCBFTVBUWV9PQkpcclxuXHJcbiAgICBjb25zdCBlbCA9IChuZXdWTm9kZS5lbCA9IHByZVZOb2RlLmVsKSBhcyBFbGVtZW50XHJcbiAgICBwYXRjaENoaWxkcmVuKHByZVZOb2RlLCBuZXdWTm9kZSwgZWwsIHBhcmVudENvbXBvbmVudCwgYW5jaG9yKVxyXG4gICAgcGF0Y2hQcm9wcyhlbCwgb2xkUHJvcHMsIG5ld1Byb3BzKVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcGF0Y2hDaGlsZHJlbihcclxuICAgIHByZVZOb2RlOiBWTm9kZSxcclxuICAgIG5ld1ZOb2RlOiBWTm9kZSxcclxuICAgIGVsOiBFbGVtZW50LFxyXG4gICAgcGFyZW50Q29tcG9uZW50PzogQ29tcG9uZW50SW5zdGFuY2UsXHJcbiAgICBhbmNob3I/OiBFbGVtZW50XHJcbiAgKSB7XHJcbiAgICBjb25zdCBuZXdDaGlsZHJlbiA9IG5ld1ZOb2RlLmNoaWxkcmVuXHJcbiAgICBjb25zdCBwcmVDaGlsZHJlbiA9IHByZVZOb2RlLmNoaWxkcmVuXHJcblxyXG4gICAgLy8g5pawY2hpbGRyZW7mmK/mlofmnKxcclxuICAgIGlmIChpc1N0cmluZyhuZXdDaGlsZHJlbikpIHtcclxuICAgICAgaWYgKGlzQXJyYXkocHJlQ2hpbGRyZW4pKSB7XHJcbiAgICAgICAgLy8g5oqK6ICBY2hpbGRyZW7muIXnqbpcclxuICAgICAgICB1bm1vdW50Q2hpbGRyZW4ocHJlQ2hpbGRyZW4gYXMgVk5vZGVbXSlcclxuICAgICAgfVxyXG4gICAgICBpZiAobmV3Q2hpbGRyZW4gIT09IHByZUNoaWxkcmVuKSB7XHJcbiAgICAgICAgLy8g5pu05pawdGV4dFxyXG4gICAgICAgIGhvc3RTZXRFbGVtZW50VGV4dChlbCwgbmV3Q2hpbGRyZW4pXHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoaXNBcnJheShuZXdDaGlsZHJlbikpIHtcclxuICAgICAgaWYgKGlzU3RyaW5nKHByZUNoaWxkcmVuKSkge1xyXG4gICAgICAgIGhvc3RTZXRFbGVtZW50VGV4dChlbCwgXCJcIilcclxuICAgICAgICBtb3VudENoaWxkcmVuKG5ld0NoaWxkcmVuIGFzIFZOb2RlW10sIGVsLCBwYXJlbnRDb21wb25lbnQsIGFuY2hvcilcclxuICAgICAgfSBlbHNlIGlmIChpc0FycmF5KHByZUNoaWxkcmVuKSkge1xyXG4gICAgICAgIC8vIGRpZmYgYXJyYXlcclxuICAgICAgICBwYXRjaEtleWVkQ2hpbGRyZW4oXHJcbiAgICAgICAgICBuZXdDaGlsZHJlbiBhcyBWTm9kZVtdLFxyXG4gICAgICAgICAgcHJlQ2hpbGRyZW4gYXMgVk5vZGVbXSxcclxuICAgICAgICAgIGVsLFxyXG4gICAgICAgICAgcGFyZW50Q29tcG9uZW50LFxyXG4gICAgICAgICAgYW5jaG9yXHJcbiAgICAgICAgKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpc1NhbWVLZXlOb2RlKG4xOiBWTm9kZSwgbjI6IFZOb2RlKSB7XHJcbiAgICByZXR1cm4gbjEua2V5ID09PSBuMi5rZXkgJiYgbjEudHlwZSA9PT0gbjIudHlwZVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcGF0Y2hLZXllZENoaWxkcmVuKFxyXG4gICAgbmV3Q2hpbGRyZW46IFZOb2RlW10sXHJcbiAgICBwcmVDaGlsZHJlbjogVk5vZGVbXSxcclxuICAgIGVsOiBFbGVtZW50LFxyXG4gICAgcGFyZW50Q29tcG9uZW50LFxyXG4gICAgcGFyZW50QW5jaG9yPzogRWxlbWVudFxyXG4gICkge1xyXG4gICAgLy8g5Zub5Liq57Si5byV5YC8XHJcbiAgICBsZXQgcHJlU3RhcnRJbmRleCA9IDBcclxuICAgIGxldCBwcmVFbmRJbmRleCA9IHByZUNoaWxkcmVuLmxlbmd0aCAtIDFcclxuICAgIGxldCBuZXdTdGFydEluZGV4ID0gMFxyXG4gICAgbGV0IG5ld0VuZEluZGV4ID0gbmV3Q2hpbGRyZW4ubGVuZ3RoIC0gMVxyXG4gICAgLy8g5Zub5Liq57Si5byV5oyH5ZCR55qEdm5vZGXoioLngrlcclxuICAgIGxldCBwcmVTdGFydFZOb2RlID0gcHJlQ2hpbGRyZW5bcHJlU3RhcnRJbmRleF1cclxuICAgIGxldCBwcmVFbmRWTm9kZSA9IHByZUNoaWxkcmVuW3ByZUVuZEluZGV4XVxyXG4gICAgbGV0IG5ld1N0YXJ0Vk5vZGUgPSBuZXdDaGlsZHJlbltuZXdTdGFydEluZGV4XVxyXG4gICAgbGV0IG5ld0VuZFZOb2RlID0gbmV3Q2hpbGRyZW5bbmV3RW5kSW5kZXhdXHJcblxyXG4gICAgd2hpbGUgKHByZVN0YXJ0SW5kZXggPD0gcHJlRW5kSW5kZXggJiYgbmV3U3RhcnRJbmRleCA8PSBuZXdFbmRJbmRleCkge1xyXG4gICAgICBpZiAoIXByZVN0YXJ0Vk5vZGUpIHtcclxuICAgICAgICBwcmVTdGFydFZOb2RlID0gcHJlQ2hpbGRyZW5bKytwcmVTdGFydEluZGV4XVxyXG4gICAgICB9IGVsc2UgaWYgKCFwcmVFbmRWTm9kZSkge1xyXG4gICAgICAgIHByZUVuZFZOb2RlID0gcHJlQ2hpbGRyZW5bLS1wcmVFbmRJbmRleF1cclxuICAgICAgfSBlbHNlIGlmIChpc1NhbWVLZXlOb2RlKHByZVN0YXJ0Vk5vZGUsIG5ld1N0YXJ0Vk5vZGUpKSB7XHJcbiAgICAgICAgcGF0Y2gobmV3U3RhcnRWTm9kZSwgcHJlU3RhcnRWTm9kZSwgZWwsIHBhcmVudENvbXBvbmVudCwgcGFyZW50QW5jaG9yKVxyXG4gICAgICAgIHByZVN0YXJ0Vk5vZGUgPSBwcmVDaGlsZHJlblsrK3ByZVN0YXJ0SW5kZXhdXHJcbiAgICAgICAgbmV3U3RhcnRWTm9kZSA9IG5ld0NoaWxkcmVuWysrbmV3U3RhcnRJbmRleF1cclxuICAgICAgfSBlbHNlIGlmIChpc1NhbWVLZXlOb2RlKHByZUVuZFZOb2RlLCBuZXdFbmRWTm9kZSkpIHtcclxuICAgICAgICBwYXRjaChuZXdFbmRWTm9kZSwgcHJlRW5kVk5vZGUsIGVsLCBwYXJlbnRDb21wb25lbnQsIHBhcmVudEFuY2hvcilcclxuICAgICAgICBwcmVFbmRWTm9kZSA9IHByZUNoaWxkcmVuWy0tcHJlRW5kSW5kZXhdXHJcbiAgICAgICAgbmV3RW5kVk5vZGUgPSBuZXdDaGlsZHJlblstLW5ld0VuZEluZGV4XVxyXG4gICAgICB9IGVsc2UgaWYgKHByZVN0YXJ0Vk5vZGUua2V5ID09PSBuZXdFbmRWTm9kZS5rZXkpIHtcclxuICAgICAgICBwYXRjaChuZXdFbmRWTm9kZSwgcHJlU3RhcnRWTm9kZSwgZWwsIHBhcmVudENvbXBvbmVudCwgcGFyZW50QW5jaG9yKVxyXG4gICAgICAgIGhvc3RJbnNlcnQocHJlU3RhcnRWTm9kZS5lbCwgZWwsIHByZUVuZFZOb2RlLmVsPy5uZXh0U2libGluZylcclxuICAgICAgICBwcmVTdGFydFZOb2RlID0gcHJlQ2hpbGRyZW5bKytwcmVTdGFydEluZGV4XVxyXG4gICAgICAgIG5ld0VuZFZOb2RlID0gbmV3Q2hpbGRyZW5bLS1uZXdFbmRJbmRleF1cclxuICAgICAgfSBlbHNlIGlmIChwcmVFbmRWTm9kZS5rZXkgPT09IG5ld1N0YXJ0Vk5vZGUua2V5KSB7XHJcbiAgICAgICAgcGF0Y2gobmV3U3RhcnRWTm9kZSwgcHJlRW5kVk5vZGUsIGVsLCBwYXJlbnRDb21wb25lbnQsIHBhcmVudEFuY2hvcilcclxuICAgICAgICBob3N0SW5zZXJ0KHByZUVuZFZOb2RlLmVsLCBlbCwgcHJlU3RhcnRWTm9kZS5lbClcclxuICAgICAgICBwcmVFbmRWTm9kZSA9IHByZUNoaWxkcmVuWy0tcHJlRW5kSW5kZXhdXHJcbiAgICAgICAgbmV3U3RhcnRWTm9kZSA9IG5ld0NoaWxkcmVuWysrbmV3U3RhcnRJbmRleF1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyDlpITnkIbpnZ7nkIbmgKfnmoTmg4XlhrVcclxuICAgICAgICBjb25zdCBpbmRleEluUHJlID0gcHJlQ2hpbGRyZW4uZmluZEluZGV4KFxyXG4gICAgICAgICAgKG5vZGUpID0+IG5vZGUua2V5ID09PSBuZXdTdGFydFZOb2RlLmtleVxyXG4gICAgICAgIClcclxuXHJcbiAgICAgICAgaWYgKGluZGV4SW5QcmUgPiAwKSB7XHJcbiAgICAgICAgICAvLyDog73lnKhwcmVDaGlsZHJlbuS4reaJvuWIsG5ld1N0YXJWTm9kZe+8jOivtOaYjuWPr+S7peWkjeeUqO+8jOenu+WKqOaXp+iKgueCuVxyXG4gICAgICAgICAgY29uc3Qgdm5vZGVUb01vdmUgPSBwcmVDaGlsZHJlbltpbmRleEluUHJlXVxyXG4gICAgICAgICAgcGF0Y2gobmV3U3RhcnRWTm9kZSwgdm5vZGVUb01vdmUsIGVsLCBwYXJlbnRDb21wb25lbnQsIHBhcmVudEFuY2hvcilcclxuICAgICAgICAgIGhvc3RJbnNlcnQodm5vZGVUb01vdmUuZWwsIGVsLCBwcmVTdGFydFZOb2RlLmVsKVxyXG4gICAgICAgICAgOyhwcmVDaGlsZHJlbiBhcyBhbnkpW2luZGV4SW5QcmVdID0gdW5kZWZpbmVkXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIC8vIOaJvuS4jeWIsO+8jOivtOaYjuaYr+aWsOeahOiKgueCue+8jOi/m+ihjOaMgui9vVxyXG4gICAgICAgICAgcGF0Y2goXHJcbiAgICAgICAgICAgIG5ld1N0YXJ0Vk5vZGUsXHJcbiAgICAgICAgICAgIG51bGwsXHJcbiAgICAgICAgICAgIGVsLFxyXG4gICAgICAgICAgICBwYXJlbnRDb21wb25lbnQsXHJcbiAgICAgICAgICAgIHByZVN0YXJ0Vk5vZGUuZWwgYXMgRWxlbWVudFxyXG4gICAgICAgICAgKVxyXG4gICAgICAgIH1cclxuICAgICAgICBuZXdTdGFydFZOb2RlID0gbmV3Q2hpbGRyZW5bKytuZXdTdGFydEluZGV4XVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8g5qOA5p+l5piv5ZCm6L+Y5pyJ6YGX55WZ55qE6IqC54K5XHJcbiAgICBpZiAocHJlRW5kSW5kZXggPCBwcmVTdGFydEluZGV4ICYmIG5ld1N0YXJ0SW5kZXggPD0gbmV3RW5kSW5kZXgpIHtcclxuICAgICAgLy8g5pyJ5paw5aKe55qE6IqC54K56KaB5aSE55CGXHJcbiAgICAgIGZvciAobGV0IGkgPSBuZXdTdGFydEluZGV4OyBpIDw9IG5ld0VuZEluZGV4OyBpKyspIHtcclxuICAgICAgICBwYXRjaChcclxuICAgICAgICAgIG5ld0NoaWxkcmVuW2ldLFxyXG4gICAgICAgICAgbnVsbCxcclxuICAgICAgICAgIGVsLFxyXG4gICAgICAgICAgcGFyZW50Q29tcG9uZW50LFxyXG4gICAgICAgICAgcHJlU3RhcnRWTm9kZS5lbCBhcyBFbGVtZW50XHJcbiAgICAgICAgKVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKG5ld0VuZEluZGV4IDwgbmV3U3RhcnRJbmRleCAmJiBwcmVTdGFydEluZGV4IDw9IHByZUVuZEluZGV4KSB7XHJcbiAgICAgIC8vIOacieWNuOi9veeahOiKgueCueimgeWkhOeQhlxyXG4gICAgICBjb25zdCBjaGlsZFdpbGxVbm1vdW50TGlzdDogVk5vZGVbXSA9IFtdXHJcbiAgICAgIGZvciAobGV0IGkgPSBwcmVTdGFydEluZGV4OyBpIDw9IHByZUVuZEluZGV4OyBpKyspIHtcclxuICAgICAgICBjaGlsZFdpbGxVbm1vdW50TGlzdC5wdXNoKHByZUNoaWxkcmVuW2ldKVxyXG4gICAgICB9XHJcbiAgICAgIHVubW91bnRDaGlsZHJlbihjaGlsZFdpbGxVbm1vdW50TGlzdClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHVubW91bnRDaGlsZHJlbihjaGlsZHJlbjogVk5vZGVbXSkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xyXG4gICAgICBjb25zdCBlbCA9IGNoaWxkcmVuW2ldLmVsXHJcbiAgICAgIGhvc3RSZW1vdmUoZWwpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjb25zdCBFTVBUWV9PQkogPSB7fVxyXG4gIGZ1bmN0aW9uIHBhdGNoUHJvcHMoZWw6IEVsZW1lbnQsIG9sZFByb3BzLCBuZXdQcm9wcykge1xyXG4gICAgaWYgKG9sZFByb3BzID09PSBuZXdQcm9wcykge1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGZvciAoY29uc3Qga2V5IGluIG5ld1Byb3BzKSB7XHJcbiAgICAgIGNvbnN0IHByZVByb3AgPSBvbGRQcm9wc1trZXldXHJcbiAgICAgIGNvbnN0IG5leHRQcm9wID0gbmV3UHJvcHNba2V5XVxyXG5cclxuICAgICAgaWYgKHByZVByb3AgIT09IG5leHRQcm9wKSB7XHJcbiAgICAgICAgaG9zdFBhdGNoUHJvcChlbCwga2V5LCBwcmVQcm9wLCBuZXh0UHJvcClcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKG9sZFByb3BzID09PSBFTVBUWV9PQkopIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICAvLyDnp7vpmaTkuI3lrZjlnKjnmoRwcm9wc1xyXG4gICAgZm9yIChjb25zdCBrZXkgaW4gb2xkUHJvcHMpIHtcclxuICAgICAgaWYgKCEoa2V5IGluIG5ld1Byb3BzKSkge1xyXG4gICAgICAgIGhvc3RQYXRjaFByb3AoZWwsIGtleSwgb2xkUHJvcHNba2V5XSwgbnVsbClcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gbW91bnRFbGVtZW50KFxyXG4gICAgaW5pdGlhbFZub2RlOiBWTm9kZSxcclxuICAgIGNvbnRhaW5lcjogRWxlbWVudCxcclxuICAgIHBhcmVudENvbXBvbmVudD86IENvbXBvbmVudEluc3RhbmNlLFxyXG4gICAgYW5jaG9yPzogRWxlbWVudFxyXG4gICkge1xyXG4gICAgY29uc3QgZWwgPSAoaW5pdGlhbFZub2RlLmVsID0gaG9zdENyZWF0ZUVsZW1lbnQoXHJcbiAgICAgIGluaXRpYWxWbm9kZS50eXBlIGFzIHN0cmluZ1xyXG4gICAgKSlcclxuICAgIGNvbnN0IHsgY2hpbGRyZW4sIHByb3BzIH0gPSBpbml0aWFsVm5vZGVcclxuXHJcbiAgICAvLyDlpITnkIZwcm9wc1xyXG4gICAgZm9yIChjb25zdCBrZXkgaW4gcHJvcHMpIHtcclxuICAgICAgY29uc3QgdmFsdWUgPSBwcm9wc1trZXldXHJcbiAgICAgIGhvc3RQYXRjaFByb3AoZWwsIGtleSwgbnVsbCwgdmFsdWUpXHJcbiAgICB9XHJcbiAgICAvLyDlpITnkIZjaGlsZHJlblxyXG4gICAgaWYgKHR5cGVvZiBjaGlsZHJlbiA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICBlbC50ZXh0Q29udGVudCA9IGNoaWxkcmVuIGFzIHN0cmluZ1xyXG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGNoaWxkcmVuKSkge1xyXG4gICAgICBtb3VudENoaWxkcmVuKGNoaWxkcmVuLCBlbCwgcGFyZW50Q29tcG9uZW50LCBhbmNob3IpXHJcbiAgICB9XHJcbiAgICAvLyDmjILovb1cclxuICAgIGhvc3RJbnNlcnQoZWwsIGNvbnRhaW5lciwgYW5jaG9yKVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gbW91bnRDaGlsZHJlbihcclxuICAgIGNoaWxkcmVuOiBWTm9kZVtdLFxyXG4gICAgZWw6IEVsZW1lbnQsXHJcbiAgICBwYXJlbnRDb21wb25lbnQ/OiBDb21wb25lbnRJbnN0YW5jZSxcclxuICAgIGFuY2hvcj86IEVsZW1lbnRcclxuICApIHtcclxuICAgIGNoaWxkcmVuLmZvckVhY2goKGNoaWxkKSA9PiB7XHJcbiAgICAgIHBhdGNoKGNoaWxkLCBudWxsLCBlbCwgcGFyZW50Q29tcG9uZW50LCBhbmNob3IpXHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcHJvY2Vzc0NvbXBvbmVudChcclxuICAgIG5ld1ZOb2RlOiBWTm9kZSxcclxuICAgIG9sZFZOb2RlOiBWTm9kZSB8IG51bGwsXHJcbiAgICBjb250YWluZXI6IEVsZW1lbnQsXHJcbiAgICBwYXJlbnRDb21wb25lbnQ/OiBDb21wb25lbnRJbnN0YW5jZSxcclxuICAgIGFuY2hvcj86IEVsZW1lbnRcclxuICApIHtcclxuICAgIGlmICghb2xkVk5vZGUpIHtcclxuICAgICAgbW91bnRDb21wb25lbnQobmV3Vk5vZGUsIGNvbnRhaW5lciwgcGFyZW50Q29tcG9uZW50LCBhbmNob3IpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB1cGRhdGVDb21wb25lbnQobmV3Vk5vZGUsIG9sZFZOb2RlKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gdXBkYXRlQ29tcG9uZW50KG5ld1ZOb2RlOiBWTm9kZSwgb2xkVk5vZGU6IFZOb2RlIHwgbnVsbCkge1xyXG4gICAgY29uc3QgaW5zdGFuY2UgPSBvbGRWTm9kZT8uY29tcG9uZW50IGFzIENvbXBvbmVudEluc3RhbmNlXHJcbiAgICBpZiAoc2hvdWxkVXBkYXRlQ29tcG9uZW50KG5ld1ZOb2RlLCBvbGRWTm9kZSkpIHtcclxuICAgICAgbmV3Vk5vZGUuY29tcG9uZW50ID0gaW5zdGFuY2VcclxuICAgICAgaW5zdGFuY2UubmV4dCA9IG5ld1ZOb2RlXHJcbiAgICAgIGluc3RhbmNlLnVwZGF0ZT8uKClcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIOS4jeabtOaWsOWwseimgemHjee9rlxyXG4gICAgICBuZXdWTm9kZS5jb21wb25lbnQgPSBvbGRWTm9kZT8uY29tcG9uZW50XHJcbiAgICAgIG5ld1ZOb2RlLmVsID0gb2xkVk5vZGU/LmVsIGFzIEVsZW1lbnRcclxuICAgICAgaW5zdGFuY2Uudm5vZGUgPSBuZXdWTm9kZVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gbW91bnRDb21wb25lbnQoXHJcbiAgICB2bm9kZTogVk5vZGUsXHJcbiAgICBjb250YWluZXI6IEVsZW1lbnQsXHJcbiAgICBwYXJlbnRDb21wb25lbnQ/OiBDb21wb25lbnRJbnN0YW5jZSxcclxuICAgIGFuY2hvcj86IEVsZW1lbnRcclxuICApIHtcclxuICAgIGNvbnN0IGluc3RhbmNlID0gY3JlYXRlQ29tcG9uZW50SW5zdGFuY2Uodm5vZGUsIHBhcmVudENvbXBvbmVudClcclxuICAgIHZub2RlLmNvbXBvbmVudCA9IGluc3RhbmNlXHJcblxyXG4gICAgc2V0dXBDb21wb25lbnQoaW5zdGFuY2UpXHJcbiAgICBzZXR1cFJlbmRlckVmZmVjdChpbnN0YW5jZSwgdm5vZGUsIGNvbnRhaW5lciwgYW5jaG9yKVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc2V0dXBSZW5kZXJFZmZlY3QoXHJcbiAgICBpbnN0YW5jZTogQ29tcG9uZW50SW5zdGFuY2UsXHJcbiAgICB2bm9kZTogVk5vZGUsXHJcbiAgICBjb250YWluZXI6IEVsZW1lbnQsXHJcbiAgICBhbmNob3I/OiBFbGVtZW50XHJcbiAgKSB7XHJcbiAgICBpbnN0YW5jZS51cGRhdGUgPSBlZmZlY3QoXHJcbiAgICAgICgpID0+IHtcclxuICAgICAgICBpZiAoIWluc3RhbmNlLmlzTW91bnRlZCkge1xyXG4gICAgICAgICAgLy8g5oyC6L29XHJcbiAgICAgICAgICBjb25zdCB7IHByb3h5IH0gPSBpbnN0YW5jZVxyXG4gICAgICAgICAgY29uc3Qgc3ViVHJlZSA9IChpbnN0YW5jZS5zdWJUcmVlID0gaW5zdGFuY2UucmVuZGVyIS5jYWxsKFxyXG4gICAgICAgICAgICBwcm94eSxcclxuICAgICAgICAgICAgcHJveHlcclxuICAgICAgICAgICkpXHJcblxyXG4gICAgICAgICAgcGF0Y2goc3ViVHJlZSwgbnVsbCwgY29udGFpbmVyLCBpbnN0YW5jZSwgYW5jaG9yKVxyXG4gICAgICAgICAgLy8g5omA5pyJ55qEZWxlbWVudOmDveW3sue7j+WkhOeQhuWujFxyXG4gICAgICAgICAgdm5vZGUuZWwgPSBzdWJUcmVlLmVsXHJcbiAgICAgICAgICBpbnN0YW5jZS5pc01vdW50ZWQgPSB0cnVlXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIC8vIOabtOaWsFxyXG4gICAgICAgICAgLy8g5pu05pawcHJvcHNcclxuICAgICAgICAgIGNvbnN0IHsgbmV4dDogbmV3Vk5vZGUsIHZub2RlOiBwcmVWTm9kZSB9ID0gaW5zdGFuY2VcclxuICAgICAgICAgIGlmIChuZXdWTm9kZSkge1xyXG4gICAgICAgICAgICBuZXdWTm9kZS5lbCA9IHByZVZOb2RlLmVsXHJcbiAgICAgICAgICAgIHVwZGF0ZUNvbXBvbmVudFByZVJlbmRlcihpbnN0YW5jZSwgbmV3Vk5vZGUpXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgY29uc3QgeyBwcm94eSB9ID0gaW5zdGFuY2VcclxuICAgICAgICAgIGNvbnN0IHN1YlRyZWUgPSBpbnN0YW5jZS5yZW5kZXIhLmNhbGwocHJveHksIHByb3h5KVxyXG4gICAgICAgICAgY29uc3QgcHJlU3ViVHJlZSA9IGluc3RhbmNlLnN1YlRyZWVcclxuICAgICAgICAgIGluc3RhbmNlLnN1YlRyZWUgPSBzdWJUcmVlXHJcblxyXG4gICAgICAgICAgcGF0Y2goc3ViVHJlZSwgcHJlU3ViVHJlZSwgY29udGFpbmVyLCBpbnN0YW5jZSwgYW5jaG9yKVxyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAge1xyXG4gICAgICAgIHNjaGVkdWxlcjogKCkgPT4ge1xyXG4gICAgICAgICAgcXVldWVKb2JzKGluc3RhbmNlLnVwZGF0ZSlcclxuICAgICAgICB9LFxyXG4gICAgICB9XHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiB1cGRhdGVDb21wb25lbnRQcmVSZW5kZXIoXHJcbiAgICBpbnN0YW5jZTogQ29tcG9uZW50SW5zdGFuY2UsXHJcbiAgICBuZXdWTm9kZTogVk5vZGVcclxuICApIHtcclxuICAgIGluc3RhbmNlLnZub2RlID0gbmV3Vk5vZGVcclxuICAgIGluc3RhbmNlLm5leHQgPSB1bmRlZmluZWRcclxuICAgIGluc3RhbmNlLnByb3BzID0gbmV3Vk5vZGUucHJvcHNcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBjcmVhdGVBcHA6IGNyZWF0ZUFwcEFQSShyZW5kZXIpLFxyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgeyBGcmFnbWVudCB9IGZyb20gXCIuL3JlbmRlcmVyXCJcclxuaW1wb3J0IHsgY3JlYXRlVk5vZGUgfSBmcm9tIFwiLi92bm9kZVwiXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyU2xvdHMoc2xvdHMsIG5hbWUsIHByb3BzKSB7XHJcbiAgY29uc3Qgc2xvdCA9IHNsb3RzW25hbWVdXHJcbiAgaWYgKHNsb3QpIHtcclxuICAgIGxldCByZW5kZXJTbG90ID0gc2xvdFxyXG4gICAgaWYgKHR5cGVvZiBzbG90ID09PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgICAgcmVuZGVyU2xvdCA9IHNsb3QocHJvcHMpXHJcbiAgICAgIHJlbmRlclNsb3QgPSBBcnJheS5pc0FycmF5KHJlbmRlclNsb3QpID8gcmVuZGVyU2xvdCA6IFtyZW5kZXJTbG90XVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGNyZWF0ZVZOb2RlKEZyYWdtZW50LCB7fSwgcmVuZGVyU2xvdClcclxuICB9XHJcbiAgcmV0dXJuIHt9XHJcbn1cclxuIiwiaW1wb3J0IHsgY3JlYXRlVk5vZGUsIFZOb2RlIH0gZnJvbSBcIi4vdm5vZGVcIlxyXG5cclxudHlwZSBDaGlsZHJlbiA9IHN0cmluZyB8IFZOb2RlW10gfCBWTm9kZVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBDb21wb25lbnQge1xyXG4gIHJlbmRlcjogKF9jdHgpID0+IFZOb2RlXHJcbiAgdGVtcGxhdGU/OiBzdHJpbmdcclxuICBzZXR1cDogKHByb3BzOiBvYmplY3QsIHsgZW1pdCB9KSA9PiBvYmplY3RcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGgodHlwZTogc3RyaW5nKVxyXG5leHBvcnQgZnVuY3Rpb24gaCh0eXBlOiBzdHJpbmcsIHByb3BzOiBvYmplY3QpXHJcbmV4cG9ydCBmdW5jdGlvbiBoKHR5cGU6IHN0cmluZywgY2hpbGRyZW46IENoaWxkcmVuKVxyXG5leHBvcnQgZnVuY3Rpb24gaCh0eXBlOiBzdHJpbmcsIHByb3BzOiBvYmplY3QsIGNoaWxkcmVuOiBDaGlsZHJlbilcclxuZXhwb3J0IGZ1bmN0aW9uIGgoXHJcbiAgdHlwZTogc3RyaW5nIHwgQ29tcG9uZW50LFxyXG4gIHByb3BzT3JDaGlsZHJlbj86IG9iamVjdCB8IENoaWxkcmVuLFxyXG4gIF9jaGlsZHJlbj86IENoaWxkcmVuXHJcbikge1xyXG4gIGxldCBwcm9wc1xyXG4gIGxldCBjaGlsZHJlblxyXG4gIGlmIChpc1Byb3BzKHByb3BzT3JDaGlsZHJlbikpIHtcclxuICAgIHByb3BzID0gcHJvcHNPckNoaWxkcmVuXHJcbiAgICBjaGlsZHJlbiA9IFtdXHJcbiAgfSBlbHNlIGlmIChpc0NoaWxkcmVuKHByb3BzT3JDaGlsZHJlbikpIHtcclxuICAgIHByb3BzID0ge31cclxuICAgIGNoaWxkcmVuID0gcHJvcHNPckNoaWxkcmVuXHJcbiAgfSBlbHNlIHtcclxuICAgIHByb3BzID0ge31cclxuICAgIGNoaWxkcmVuID0gW11cclxuICB9XHJcbiAgaWYgKF9jaGlsZHJlbikge1xyXG4gICAgY2hpbGRyZW4gPSBfY2hpbGRyZW5cclxuICB9XHJcbiAgcmV0dXJuIGNyZWF0ZVZOb2RlKHR5cGUsIHByb3BzLCBjaGlsZHJlbilcclxufVxyXG5cclxuZnVuY3Rpb24gaXNQcm9wcyhwcm9wc09yQ2hpbGRyZW4/OiBvYmplY3QgfCBDaGlsZHJlbikge1xyXG4gIHJldHVybiB0eXBlb2YgcHJvcHNPckNoaWxkcmVuID09PSBcIm9iamVjdFwiICYmICFBcnJheS5pc0FycmF5KHByb3BzT3JDaGlsZHJlbilcclxufVxyXG5cclxuZnVuY3Rpb24gaXNDaGlsZHJlbihwcm9wc09yQ2hpbGRyZW4/OiBvYmplY3QgfCBDaGlsZHJlbikge1xyXG4gIHJldHVybiB0eXBlb2YgcHJvcHNPckNoaWxkcmVuID09PSBcInN0cmluZ1wiIHx8IEFycmF5LmlzQXJyYXkocHJvcHNPckNoaWxkcmVuKVxyXG59XHJcbiIsImltcG9ydCB7IGdldEN1cnJlbnRJbnN0YW5jZSB9IGZyb20gXCIuL2NvbXBvbmVudFwiXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcHJvdmlkZShrZXksIHZhbHVlKSB7XHJcbiAgY29uc3QgY3VycmVudEluc3RhbmNlID0gZ2V0Q3VycmVudEluc3RhbmNlKClcclxuICBpZiAoIWN1cnJlbnRJbnN0YW5jZSkgcmV0dXJuXHJcbiAgY29uc3QgcGFyZW50UHJvdmlkZXMgPSBjdXJyZW50SW5zdGFuY2UucGFyZW50Py5wcm92aWRlc1xyXG4gIGlmIChwYXJlbnRQcm92aWRlcykge1xyXG4gICAgbGV0IHsgcHJvdmlkZXMgfSA9IGN1cnJlbnRJbnN0YW5jZVxyXG4gICAgaWYgKHByb3ZpZGVzID09PSBwYXJlbnRQcm92aWRlcykge1xyXG4gICAgICBwcm92aWRlcyA9IGN1cnJlbnRJbnN0YW5jZS5wcm92aWRlcyA9IE9iamVjdC5jcmVhdGUocGFyZW50UHJvdmlkZXMpXHJcbiAgICB9XHJcbiAgICBpZiAocHJvdmlkZXMpIHByb3ZpZGVzW2tleV0gPSB2YWx1ZVxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGluamVjdChrZXksIGRlZmF1bHRWYWwpIHtcclxuICBjb25zdCBjdXJyZW50SW5zdGFuY2UgPSBnZXRDdXJyZW50SW5zdGFuY2UoKVxyXG4gIGlmICghY3VycmVudEluc3RhbmNlKSByZXR1cm5cclxuICBjb25zdCBwYXJlbnRQcm92aWRlcyA9IGN1cnJlbnRJbnN0YW5jZS5wYXJlbnQ/LnByb3ZpZGVzXHJcbiAgaWYgKHBhcmVudFByb3ZpZGVzKVxyXG4gICAgcmV0dXJuIChcclxuICAgICAgcGFyZW50UHJvdmlkZXNba2V5XSB8fFxyXG4gICAgICAodHlwZW9mIGRlZmF1bHRWYWwgPT09IFwiZnVuY3Rpb25cIiA/IGRlZmF1bHRWYWwoKSA6IGRlZmF1bHRWYWwpXHJcbiAgICApXHJcbn1cclxuIiwiaW1wb3J0IHsgY3JlYXRlUmVuZGVyZXIgfSBmcm9tIFwiQG1pbi12dWUvcnVudGltZS1jb3JlXCJcclxuZXhwb3J0ICogZnJvbSBcIkBtaW4tdnVlL3J1bnRpbWUtY29yZVwiXHJcblxyXG5mdW5jdGlvbiBjcmVhdGVFbGVtZW50KHR5cGU6IHN0cmluZykge1xyXG4gIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHR5cGUpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhdGNoUHJvcChlbDogRWxlbWVudCwga2V5OiBzdHJpbmcsIG9sZFZhbHVlLCBuZXdWYWx1ZSkge1xyXG4gIGNvbnN0IGlzT24gPSAoa2V5OiBzdHJpbmcpID0+IC9eb25bQS1aXS8udGVzdChrZXkpXHJcbiAgaWYgKGlzT24oa2V5KSkge1xyXG4gICAgY29uc3QgZXZlbnQgPSBrZXkuc2xpY2UoMikudG9Mb3dlckNhc2UoKVxyXG4gICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgbmV3VmFsdWUpXHJcbiAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBvbGRWYWx1ZSlcclxuICB9IGVsc2Uge1xyXG4gICAgaWYgKG5ld1ZhbHVlID09PSB1bmRlZmluZWQgfHwgbmV3VmFsdWUgPT09IG51bGwpIHtcclxuICAgICAgZWwucmVtb3ZlQXR0cmlidXRlKGtleSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGVsLnNldEF0dHJpYnV0ZShrZXksIG5ld1ZhbHVlKVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gaW5zZXJ0KGVsOiBFbGVtZW50LCBwYXJlbnQ6IEVsZW1lbnQsIGFuY2hvcjogRWxlbWVudCB8IG51bGwgPSBudWxsKSB7XHJcbiAgcGFyZW50Lmluc2VydEJlZm9yZShlbCwgYW5jaG9yKVxyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVUZXh0Tm9kZShjb250ZW50OiBzdHJpbmcpIHtcclxuICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoY29udGVudClcclxufVxyXG5cclxuZnVuY3Rpb24gcmVtb3ZlKGNoaWxkOiBFbGVtZW50KSB7XHJcbiAgY29uc3QgcGFyZW50ID0gY2hpbGQucGFyZW50Tm9kZVxyXG4gIGlmIChwYXJlbnQpIHtcclxuICAgIHBhcmVudC5yZW1vdmVDaGlsZChjaGlsZClcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldEVsZW1lbnRUZXh0KGVsOiBFbGVtZW50LCB0ZXh0OiBzdHJpbmcpIHtcclxuICBlbC50ZXh0Q29udGVudCA9IHRleHRcclxufVxyXG5cclxuY29uc3QgcmVuZGVyZXI6IGFueSA9IGNyZWF0ZVJlbmRlcmVyKHtcclxuICBjcmVhdGVFbGVtZW50LFxyXG4gIHBhdGNoUHJvcCxcclxuICBpbnNlcnQsXHJcbiAgY3JlYXRlVGV4dE5vZGUsXHJcbiAgcmVtb3ZlLFxyXG4gIHNldEVsZW1lbnRUZXh0LFxyXG59KVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFwcCguLi5hcmdzKSB7XHJcbiAgcmV0dXJuIHJlbmRlcmVyLmNyZWF0ZUFwcCguLi5hcmdzKVxyXG59XHJcbiIsImV4cG9ydCBjb25zdCBUT19ESVNQTEFZX1NUUklORyA9IFN5bWJvbChcInRvRGlzcGxheVN0cmluZ1wiKVxyXG5leHBvcnQgY29uc3QgQ1JFQVRFX0VMRU1FTlRfVk5PREUgPSBTeW1ib2woXCJjcmVhdGVFbGVtZW50Vk5vZGVcIilcclxuXHJcbmV4cG9ydCBjb25zdCBoZWxwZXJNYXBOYW1lID0ge1xyXG4gIFtUT19ESVNQTEFZX1NUUklOR106IFwidG9EaXNwbGF5U3RyaW5nXCIsXHJcbiAgW0NSRUFURV9FTEVNRU5UX1ZOT0RFXTogXCJjcmVhdGVFbGVtZW50Vk5vZGVcIixcclxufVxyXG4iLCJpbXBvcnQgeyBDUkVBVEVfRUxFTUVOVF9WTk9ERSB9IGZyb20gXCIuL3J1bnRpbWVIZWxwZXJzXCJcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRWxlbWVudCB7XHJcbiAgdGFnOiBzdHJpbmdcclxuICB0eXBlOiBOb2RlVHlwZXNcclxuICBwcm9wcz86IGFueVxyXG4gIGNoaWxkcmVuOiBhbnlbXVxyXG4gIGNvZGVnZW5Ob2RlPzogYW55XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgSW50ZXJwb2xhdGlvbiB7XHJcbiAgdHlwZTogTm9kZVR5cGVzXHJcbiAgY29udGVudDoge1xyXG4gICAgdHlwZTogTm9kZVR5cGVzXHJcbiAgICBjb250ZW50OiBzdHJpbmdcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgVGV4dCB7XHJcbiAgdHlwZTogTm9kZVR5cGVzXHJcbiAgY29udGVudDogc3RyaW5nXHJcbn1cclxuXHJcbmV4cG9ydCB0eXBlIE5vZGUgPSBFbGVtZW50IHwgSW50ZXJwb2xhdGlvbiB8IFRleHRcclxuXHJcbmV4cG9ydCBlbnVtIE5vZGVUeXBlcyB7XHJcbiAgSU5URVJQT0xBVElPTixcclxuICBTSU1QTEVfRVhQUkVTU0lPTixcclxuICBFTEVNRU5ULFxyXG4gIFRFWFQsXHJcbiAgUk9PVCxcclxuICBDT01QT1VORF9FWFBSRVNTSU9OLFxyXG59XHJcblxyXG5leHBvcnQgZW51bSBUYWdUeXBlIHtcclxuICBTVEFSVCxcclxuICBFTkQsXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVWTm9kZUNhbGwoXHJcbiAgY29udGV4dCxcclxuICB0eXBlOiBOb2RlVHlwZXMsXHJcbiAgdGFnLFxyXG4gIHByb3BzLFxyXG4gIGNoaWxkcmVuXHJcbikge1xyXG4gIGNvbnRleHQuaGVscGVyKENSRUFURV9FTEVNRU5UX1ZOT0RFKVxyXG4gIHJldHVybiB7XHJcbiAgICB0eXBlLFxyXG4gICAgdGFnLFxyXG4gICAgcHJvcHMsXHJcbiAgICBjaGlsZHJlbixcclxuICB9XHJcbn1cclxuIiwiaW1wb3J0IHtcclxuICBDUkVBVEVfRUxFTUVOVF9WTk9ERSxcclxuICBUT19ESVNQTEFZX1NUUklORyxcclxuICBoZWxwZXJNYXBOYW1lLFxyXG59IGZyb20gXCIuL3J1bnRpbWVIZWxwZXJzXCJcclxuaW1wb3J0IHsgRWxlbWVudCwgSW50ZXJwb2xhdGlvbiwgTm9kZVR5cGVzLCBUZXh0IH0gZnJvbSBcIi4vYXN0XCJcclxuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tIFwiQG1pbi12dWUvc2hhcmVkXCJcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZShhc3QpIHtcclxuICBjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29kZWdlbkNvbnRleHQoKVxyXG4gIGNvbnN0IHsgcHVzaCB9ID0gY29udGV4dFxyXG5cclxuICAvLyDliY3lr7znoIFcclxuICBnZW5GdW5jdGlvblByZWFtYmxlKGFzdCwgY29udGV4dClcclxuXHJcbiAgY29uc3QgZnVuY3Rpb25OYW1lID0gXCJyZW5kZXJcIlxyXG4gIGNvbnN0IGFyZ3MgPSBbXCJfY3R4XCIsIFwiX2NhY2hlXCJdXHJcbiAgY29uc3Qgc2lnbmF0dXJlID0gYXJncy5qb2luKFwiLCBcIilcclxuXHJcbiAgcHVzaChgZnVuY3Rpb24gJHtmdW5jdGlvbk5hbWV9KCR7c2lnbmF0dXJlfSl7YClcclxuXHJcbiAgcHVzaChcInJldHVybiBcIilcclxuICBnZW5Ob2RlKGFzdC5jb2RlZ2VuTm9kZSwgY29udGV4dClcclxuICBwdXNoKFwifVwiKVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgY29kZTogY29udGV4dC5jb2RlLFxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2VuRnVuY3Rpb25QcmVhbWJsZShhc3QsIGNvbnRleHQpIHtcclxuICBjb25zdCB7IHB1c2ggfSA9IGNvbnRleHRcclxuICBjb25zdCBWdWVCaW5naW5nID0gXCJWdWVcIlxyXG4gIGNvbnN0IGFsaWFzSGVscGVyID0gKHMpID0+IGAke2hlbHBlck1hcE5hbWVbc119OiBfJHtoZWxwZXJNYXBOYW1lW3NdfWBcclxuICBpZiAoYXN0LmhlbHBlcnMubGVuZ3RoKSB7XHJcbiAgICBwdXNoKFxyXG4gICAgICBgY29uc3QgeyAke2FzdC5oZWxwZXJzLm1hcChhbGlhc0hlbHBlcikuam9pbihcIiwgXCIpfSB9ID0gJHtWdWVCaW5naW5nfTtgXHJcbiAgICApXHJcbiAgfVxyXG4gIHB1c2goXCJyZXR1cm4gXCIpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdlbk5vZGUobm9kZSwgY29udGV4dCkge1xyXG4gIHN3aXRjaCAobm9kZS50eXBlKSB7XHJcbiAgICBjYXNlIE5vZGVUeXBlcy5URVhUOlxyXG4gICAgICBnZW5UZXh0KG5vZGUsIGNvbnRleHQpXHJcbiAgICAgIGJyZWFrXHJcbiAgICBjYXNlIE5vZGVUeXBlcy5JTlRFUlBPTEFUSU9OOlxyXG4gICAgICBnZW5JbnRlcnBvbGF0aW9uKG5vZGUsIGNvbnRleHQpXHJcbiAgICAgIGJyZWFrXHJcbiAgICBjYXNlIE5vZGVUeXBlcy5TSU1QTEVfRVhQUkVTU0lPTjpcclxuICAgICAgZ2VuRXhwcmVzc2lvbihub2RlLCBjb250ZXh0KVxyXG4gICAgICBicmVha1xyXG4gICAgY2FzZSBOb2RlVHlwZXMuRUxFTUVOVDpcclxuICAgICAgZ2VuRWxlbWVudChub2RlLCBjb250ZXh0KVxyXG4gICAgICBicmVha1xyXG4gICAgY2FzZSBOb2RlVHlwZXMuQ09NUE9VTkRfRVhQUkVTU0lPTjpcclxuICAgICAgZ2VuQ29tcG91bmRFeHByZXNzaW9uKG5vZGUsIGNvbnRleHQpXHJcbiAgICAgIGJyZWFrXHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICBicmVha1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2VuQ29tcG91bmRFeHByZXNzaW9uKG5vZGUsIGNvbnRleHQpIHtcclxuICBjb25zdCB7IHB1c2ggfSA9IGNvbnRleHRcclxuICBjb25zdCBjaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW5cclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBjb25zdCBjaGlsZCA9IGNoaWxkcmVuW2ldXHJcbiAgICBpZiAoaXNTdHJpbmcoY2hpbGQpKSB7XHJcbiAgICAgIHB1c2goY2hpbGQpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBnZW5Ob2RlKGNoaWxkLCBjb250ZXh0KVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2VuRWxlbWVudChub2RlOiBFbGVtZW50LCBjb250ZXh0KSB7XHJcbiAgY29uc3QgeyBwdXNoLCBoZWxwZXIgfSA9IGNvbnRleHRcclxuICBjb25zdCB7IHRhZywgY2hpbGRyZW4sIHByb3BzIH0gPSBub2RlXHJcbiAgcHVzaChgJHtoZWxwZXIoQ1JFQVRFX0VMRU1FTlRfVk5PREUpfShgKVxyXG4gIGdlbk5vZGVMaXN0KGdlbk51bGxhYmxlKFt0YWcsIHByb3BzLCBjaGlsZHJlbl0pLCBjb250ZXh0KVxyXG4gIHB1c2goXCIpXCIpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdlbk5vZGVMaXN0KG5vZGVzOiBhbnlbXSwgY29udGV4dCkge1xyXG4gIGNvbnN0IHsgcHVzaCB9ID0gY29udGV4dFxyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZXMubGVuZ3RoOyBpKyspIHtcclxuICAgIGNvbnN0IG5vZGUgPSBub2Rlc1tpXVxyXG4gICAgaWYgKGlzU3RyaW5nKG5vZGUpKSB7XHJcbiAgICAgIHB1c2gobm9kZSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGdlbk5vZGUobm9kZSwgY29udGV4dClcclxuICAgIH1cclxuICAgIGlmIChpIDwgbm9kZXMubGVuZ3RoIC0gMSkge1xyXG4gICAgICBwdXNoKFwiLCBcIilcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdlbk51bGxhYmxlKGFyZ3M6IGFueVtdKSB7XHJcbiAgcmV0dXJuIGFyZ3MubWFwKChhcmcpID0+IGFyZyB8fCBcIm51bGxcIilcclxufVxyXG5cclxuZnVuY3Rpb24gZ2VuVGV4dChub2RlOiBUZXh0LCBjb250ZXh0KSB7XHJcbiAgY29uc3QgeyBwdXNoIH0gPSBjb250ZXh0XHJcbiAgcHVzaChgJyR7bm9kZS5jb250ZW50fSdgKVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZW5JbnRlcnBvbGF0aW9uKG5vZGU6IEludGVycG9sYXRpb24sIGNvbnRleHQpIHtcclxuICBjb25zdCB7IHB1c2gsIGhlbHBlciB9ID0gY29udGV4dFxyXG4gIHB1c2goYCR7aGVscGVyKFRPX0RJU1BMQVlfU1RSSU5HKX0oYClcclxuICBnZW5Ob2RlKG5vZGUuY29udGVudCwgY29udGV4dClcclxuICBwdXNoKFwiKVwiKVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZW5FeHByZXNzaW9uKG5vZGU6IEludGVycG9sYXRpb25bXCJjb250ZW50XCJdLCBjb250ZXh0KSB7XHJcbiAgY29uc3QgeyBwdXNoIH0gPSBjb250ZXh0XHJcbiAgcHVzaChgJHtub2RlLmNvbnRlbnR9YClcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlQ29kZWdlbkNvbnRleHQoKSB7XHJcbiAgY29uc3QgY29udGV4dCA9IHtcclxuICAgIGNvZGU6IFwiXCIsXHJcbiAgICBwdXNoKHNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICAgIGNvbnRleHQuY29kZSArPSBzb3VyY2VcclxuICAgIH0sXHJcbiAgICBoZWxwZXIoa2V5KSB7XHJcbiAgICAgIHJldHVybiBgXyR7aGVscGVyTWFwTmFtZVtrZXldfWBcclxuICAgIH0sXHJcbiAgfVxyXG5cclxuICByZXR1cm4gY29udGV4dFxyXG59XHJcbiIsImltcG9ydCB7IEVsZW1lbnQsIEludGVycG9sYXRpb24sIE5vZGVUeXBlcywgVGFnVHlwZSwgVGV4dCB9IGZyb20gXCIuL2FzdFwiXHJcblxyXG5pbnRlcmZhY2UgQ29udGV4dCB7XHJcbiAgc291cmNlOiBzdHJpbmdcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGJhc2VQYXJzZShjb250ZW50OiBzdHJpbmcpIHtcclxuICBjb25zdCBjb250ZXh0ID0gY3JlYXRlUGFyc2VyQ29udGV4dChjb250ZW50KVxyXG5cclxuICByZXR1cm4gY3JlYXRlUm9vdChwYXJzZUNoaWxkcmVuKGNvbnRleHQsIFtdKSlcclxufVxyXG5cclxuZnVuY3Rpb24gcGFyc2VDaGlsZHJlbihjb250ZXh0OiBDb250ZXh0LCBhbmNlc3RvcnM6IEVsZW1lbnRbXSkge1xyXG4gIGNvbnN0IG5vZGVzOiBhbnlbXSA9IFtdXHJcblxyXG4gIHdoaWxlICghaXNFbmQoY29udGV4dCwgYW5jZXN0b3JzKSkge1xyXG4gICAgbGV0IG5vZGVcclxuICAgIC8vIHt7fX1cclxuICAgIGNvbnN0IHMgPSBjb250ZXh0LnNvdXJjZVxyXG4gICAgaWYgKHMuc3RhcnRzV2l0aChcInt7XCIpKSB7XHJcbiAgICAgIG5vZGUgPSBwYXJzZUludGVycG9sYXRpb24oY29udGV4dClcclxuICAgIH0gZWxzZSBpZiAoc1swXSA9PT0gXCI8XCIpIHtcclxuICAgICAgLy8gZWxlbWVudFxyXG4gICAgICBpZiAoL1thLXpdL2kudGVzdChzWzFdKSkge1xyXG4gICAgICAgIG5vZGUgPSBwYXJzZUVsZW1lbnQoY29udGV4dCwgYW5jZXN0b3JzKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICAvLyB0ZXh0XHJcbiAgICBpZiAoIW5vZGUpIHtcclxuICAgICAgbm9kZSA9IHBhcnNlVGV4dChjb250ZXh0LCBhbmNlc3RvcnMpXHJcbiAgICB9XHJcbiAgICBpZiAobm9kZSkge1xyXG4gICAgICBub2Rlcy5wdXNoKG5vZGUpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gbm9kZXNcclxufVxyXG5cclxuZnVuY3Rpb24gaXNFbmQoY29udGV4dDogQ29udGV4dCwgYW5jZXN0b3JzOiBFbGVtZW50W10pIHtcclxuICAvLyAxLiBzb3VyY2XmnInlgLznmoTml7blgJlcclxuICAvLyAyLiDpgYfliLDnu5PmnZ/moIfnrb7nmoTml7blgJlcclxuICBjb25zdCBzID0gY29udGV4dC5zb3VyY2VcclxuICBjb25zdCBleHBlY3RUYWcgPSBhbmNlc3RvcnNbYW5jZXN0b3JzLmxlbmd0aCAtIDFdPy50YWdcclxuICBmb3IgKGxldCBpID0gYW5jZXN0b3JzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICBjb25zdCB0YWcgPSBhbmNlc3RvcnNbaV0udGFnXHJcbiAgICBpZiAocy5zdGFydHNXaXRoKGA8LyR7dGFnfT5gKSkge1xyXG4gICAgICBpZiAodGFnICE9PSBleHBlY3RUYWcpIHtcclxuICAgICAgICB0aHJvdyBFcnJvcihg5LiN5a2Y5Zyo57uT5p2f5qCH562+IDwvJHtleHBlY3RUYWd9PmApXHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gIXNcclxufVxyXG5cclxuLy8g5aSE55CGZWxlbWVudFxyXG5mdW5jdGlvbiBwYXJzZUVsZW1lbnQoY29udGV4dDogQ29udGV4dCwgYW5jZXN0b3JzOiBFbGVtZW50W10pIHtcclxuICBjb25zdCBlbGVtZW50ID0gcGFyc2VUYWcoY29udGV4dCwgVGFnVHlwZS5TVEFSVCkgYXMgRWxlbWVudFxyXG5cclxuICBhbmNlc3RvcnMucHVzaChlbGVtZW50KVxyXG4gIGVsZW1lbnQuY2hpbGRyZW4gPSBwYXJzZUNoaWxkcmVuKGNvbnRleHQsIGFuY2VzdG9ycylcclxuICBhbmNlc3RvcnMucG9wKClcclxuXHJcbiAgcGFyc2VUYWcoY29udGV4dCwgVGFnVHlwZS5FTkQpXHJcbiAgcmV0dXJuIGVsZW1lbnRcclxufVxyXG5cclxuZnVuY3Rpb24gcGFyc2VUYWcoY29udGV4dDogQ29udGV4dCwgdGFnVHlwZTogVGFnVHlwZSkge1xyXG4gIGNvbnN0IG1hdGNoID0gL148XFwvPyhbYS16XSopL2kuZXhlYyhjb250ZXh0LnNvdXJjZSkgYXMgUmVnRXhwRXhlY0FycmF5XHJcbiAgY29uc3QgdGFnID0gbWF0Y2hbMV1cclxuICBhZHZhbmNlQnkoY29udGV4dCwgbWF0Y2hbMF0ubGVuZ3RoKVxyXG4gIGFkdmFuY2VCeShjb250ZXh0LCAxKVxyXG5cclxuICBpZiAodGFnVHlwZSA9PT0gVGFnVHlwZS5FTkQpIHJldHVyblxyXG4gIHJldHVybiB7XHJcbiAgICB0eXBlOiBOb2RlVHlwZXMuRUxFTUVOVCxcclxuICAgIHRhZyxcclxuICAgIGNoaWxkcmVuOiBbXSxcclxuICB9XHJcbn1cclxuXHJcbi8vIOWkhOeQhuaPkuWAvFxyXG5mdW5jdGlvbiBwYXJzZUludGVycG9sYXRpb24oY29udGV4dDogQ29udGV4dCk6IEludGVycG9sYXRpb24ge1xyXG4gIGNvbnN0IG9wZW5EZWxpbWl0ZXIgPSBcInt7XCJcclxuICBjb25zdCBjbG9zZURlbGltaXRlciA9IFwifX1cIlxyXG5cclxuICBjb25zdCBjbG9zZUluZGV4ID0gY29udGV4dC5zb3VyY2UuaW5kZXhPZihcclxuICAgIGNsb3NlRGVsaW1pdGVyLFxyXG4gICAgb3BlbkRlbGltaXRlci5sZW5ndGhcclxuICApXHJcblxyXG4gIGFkdmFuY2VCeShjb250ZXh0LCBvcGVuRGVsaW1pdGVyLmxlbmd0aClcclxuXHJcbiAgY29uc3QgcmF3Q29udGVudExlbmd0aCA9IGNsb3NlSW5kZXggLSBvcGVuRGVsaW1pdGVyLmxlbmd0aFxyXG4gIGNvbnN0IHJhd0NvbnRlbnQgPSBwYXJzZVRleHREYXRhKGNvbnRleHQsIHJhd0NvbnRlbnRMZW5ndGgpXHJcbiAgY29uc3QgY29udGVudCA9IHJhd0NvbnRlbnQudHJpbSgpXHJcblxyXG4gIGFkdmFuY2VCeShjb250ZXh0LCByYXdDb250ZW50TGVuZ3RoICsgY2xvc2VEZWxpbWl0ZXIubGVuZ3RoKVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgdHlwZTogTm9kZVR5cGVzLklOVEVSUE9MQVRJT04sXHJcbiAgICBjb250ZW50OiB7XHJcbiAgICAgIHR5cGU6IE5vZGVUeXBlcy5TSU1QTEVfRVhQUkVTU0lPTixcclxuICAgICAgY29udGVudCxcclxuICAgIH0sXHJcbiAgfVxyXG59XHJcblxyXG4vLyDlpITnkIZ0ZXh0XHJcbmZ1bmN0aW9uIHBhcnNlVGV4dChjb250ZXh0OiBDb250ZXh0LCBhbmNlc3RvcnM6IEVsZW1lbnRbXSk6IFRleHQge1xyXG4gIGxldCBlbmRJbmRleCA9IGNvbnRleHQuc291cmNlLmxlbmd0aFxyXG4gIGNvbnN0IHRvcEVsZW1lbnQgPSBhbmNlc3RvcnNbYW5jZXN0b3JzLmxlbmd0aCAtIDFdXHJcbiAgY29uc3QgZW5kVG9rZW4gPSBbXCJ7e1wiLCBgPC8ke3RvcEVsZW1lbnQ/LnRhZyB8fCBcIlwifT5gXVxyXG5cclxuICBjb25zdCBpbmRleCA9IGVuZFRva2VuXHJcbiAgICAubWFwKCh0b2tlbikgPT4gY29udGV4dC5zb3VyY2UuaW5kZXhPZih0b2tlbikpXHJcbiAgICAuZmlsdGVyKChpKSA9PiBpICE9PSAtMSlcclxuICAgIC5zb3J0KChhLCBiKSA9PiBhIC0gYilbMF1cclxuICBpZiAoaW5kZXgpIHtcclxuICAgIGVuZEluZGV4ID0gaW5kZXhcclxuICB9XHJcbiAgY29uc3QgY29udGVudCA9IHBhcnNlVGV4dERhdGEoY29udGV4dCwgZW5kSW5kZXgpXHJcblxyXG4gIGFkdmFuY2VCeShjb250ZXh0LCBjb250ZW50Lmxlbmd0aClcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIHR5cGU6IE5vZGVUeXBlcy5URVhULFxyXG4gICAgY29udGVudCxcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlVGV4dERhdGEoY29udGV4dDogQ29udGV4dCwgbGVuZ3RoOiBudW1iZXIpIHtcclxuICByZXR1cm4gY29udGV4dC5zb3VyY2Uuc2xpY2UoMCwgbGVuZ3RoKVxyXG59XHJcblxyXG4vLyDmjqjov5vliKDpmaRcclxuZnVuY3Rpb24gYWR2YW5jZUJ5KGNvbnRleHQ6IENvbnRleHQsIGxlbmd0aDogbnVtYmVyKSB7XHJcbiAgY29udGV4dC5zb3VyY2UgPSBjb250ZXh0LnNvdXJjZS5zbGljZShsZW5ndGgpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVJvb3QoY2hpbGRyZW4pIHtcclxuICByZXR1cm4ge1xyXG4gICAgY2hpbGRyZW4sXHJcbiAgICB0eXBlOiBOb2RlVHlwZXMuUk9PVCxcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVBhcnNlckNvbnRleHQoY29udGVudDogc3RyaW5nKTogQ29udGV4dCB7XHJcbiAgcmV0dXJuIHtcclxuICAgIHNvdXJjZTogY29udGVudCxcclxuICB9XHJcbn1cclxuIiwiaW1wb3J0IHsgRWxlbWVudCwgSW50ZXJwb2xhdGlvbiwgTm9kZVR5cGVzLCBUZXh0IH0gZnJvbSBcIi4vYXN0XCJcclxuaW1wb3J0IHsgVE9fRElTUExBWV9TVFJJTkcgfSBmcm9tIFwiLi9ydW50aW1lSGVscGVyc1wiXHJcblxyXG50eXBlIE1peGluTm9kZSA9IEVsZW1lbnQgJlxyXG4gIEludGVycG9sYXRpb24gJlxyXG4gIFRleHQgJiB7IGNvZGVnZW5Ob2RlPzogRWxlbWVudDsgaGVscGVyczogc3RyaW5nW10gfVxyXG5cclxudHlwZSBPcHRpb25zID0ge1xyXG4gIG5vZGVUcmFuc2Zvcm1zPzogKChub2RlOiBhbnksIGNvbnRleHQ6IGFueSkgPT4ge30pW11cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHRyYW5zZm9ybShyb290OiBNaXhpbk5vZGUsIG9wdGlvbnM6IE9wdGlvbnMgPSB7fSkge1xyXG4gIGNvbnN0IGNvbnRleHQgPSBjcmVhdGVUcmFuc2Zvcm1Db250ZXh0KHJvb3QsIG9wdGlvbnMpXHJcbiAgdHJhdmVyc2VOb2RlKHJvb3QsIGNvbnRleHQpXHJcblxyXG4gIGNyZWF0ZVJvb3RDb2RlZ2VuKHJvb3QpXHJcblxyXG4gIHJvb3QuaGVscGVycyA9IFsuLi5jb250ZXh0LmhlbHBlcnMua2V5cygpXVxyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVSb290Q29kZWdlbihyb290OiBNaXhpbk5vZGUpIHtcclxuICBjb25zdCBjaGlsZCA9IHJvb3QuY2hpbGRyZW5bMF1cclxuICBpZiAoY2hpbGQudHlwZSA9PT0gTm9kZVR5cGVzLkVMRU1FTlQpIHtcclxuICAgIHJvb3QuY29kZWdlbk5vZGUgPSBjaGlsZC5jb2RlZ2VuTm9kZVxyXG4gIH0gZWxzZSB7XHJcbiAgICByb290LmNvZGVnZW5Ob2RlID0gcm9vdC5jaGlsZHJlblswXVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlVHJhbnNmb3JtQ29udGV4dChyb290OiBNaXhpbk5vZGUsIG9wdGlvbnM6IE9wdGlvbnMpIHtcclxuICBjb25zdCBjb250ZXh0ID0ge1xyXG4gICAgcm9vdCxcclxuICAgIG5vZGVUcmFuc2Zvcm1zOiBvcHRpb25zLm5vZGVUcmFuc2Zvcm1zIHx8IFtdLFxyXG4gICAgaGVscGVyczogbmV3IE1hcCgpLFxyXG4gICAgaGVscGVyKGtleTogU3ltYm9sKSB7XHJcbiAgICAgIGNvbnRleHQuaGVscGVycy5zZXQoa2V5LCAxKVxyXG4gICAgfSxcclxuICB9XHJcblxyXG4gIHJldHVybiBjb250ZXh0XHJcbn1cclxuXHJcbnR5cGUgQ29udGV4dCA9IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZVRyYW5zZm9ybUNvbnRleHQ+XHJcblxyXG5mdW5jdGlvbiB0cmF2ZXJzZU5vZGUobm9kZTogTWl4aW5Ob2RlLCBjb250ZXh0OiBDb250ZXh0KSB7XHJcbiAgY29uc3Qgbm9kZVRyYW5zZm9ybXMgPSBjb250ZXh0Lm5vZGVUcmFuc2Zvcm1zXHJcbiAgY29uc3QgZXhpdEZuczogYW55W10gPSBbXVxyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZVRyYW5zZm9ybXMubGVuZ3RoOyBpKyspIHtcclxuICAgIGNvbnN0IHRyYW5zZm9ybSA9IG5vZGVUcmFuc2Zvcm1zW2ldXHJcbiAgICBjb25zdCBvbkV4aXQgPSB0cmFuc2Zvcm0obm9kZSwgY29udGV4dClcclxuICAgIGlmIChvbkV4aXQpIGV4aXRGbnMucHVzaChvbkV4aXQpXHJcbiAgfVxyXG5cclxuICBzd2l0Y2ggKG5vZGUudHlwZSkge1xyXG4gICAgY2FzZSBOb2RlVHlwZXMuSU5URVJQT0xBVElPTjpcclxuICAgICAgY29udGV4dC5oZWxwZXIoVE9fRElTUExBWV9TVFJJTkcpXHJcbiAgICAgIGJyZWFrXHJcbiAgICBjYXNlIE5vZGVUeXBlcy5ST09UOlxyXG4gICAgY2FzZSBOb2RlVHlwZXMuRUxFTUVOVDpcclxuICAgICAgdHJhdmVyc2VDaGlsZHJlbihub2RlLCBjb250ZXh0KVxyXG4gICAgICBicmVha1xyXG4gICAgZGVmYXVsdDpcclxuICAgICAgYnJlYWtcclxuICB9XHJcblxyXG4gIGxldCBpID0gZXhpdEZucy5sZW5ndGhcclxuICB3aGlsZSAoaS0tKSB7XHJcbiAgICBleGl0Rm5zW2ldKClcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRyYXZlcnNlQ2hpbGRyZW4obm9kZTogTWl4aW5Ob2RlLCBjb250ZXh0OiBDb250ZXh0KSB7XHJcbiAgY29uc3QgY2hpbGRyZW4gPSBub2RlLmNoaWxkcmVuXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xyXG4gICAgY29uc3Qgbm9kZSA9IGNoaWxkcmVuW2ldXHJcbiAgICB0cmF2ZXJzZU5vZGUobm9kZSwgY29udGV4dClcclxuICB9XHJcbn1cclxuIiwiaW1wb3J0IHsgRWxlbWVudCwgTm9kZVR5cGVzLCBjcmVhdGVWTm9kZUNhbGwgfSBmcm9tIFwiLi4vYXN0XCJcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0cmFuc2Zvcm1FbGVtZW50KG5vZGU6IEVsZW1lbnQsIGNvbnRleHQpIHtcclxuICBpZiAobm9kZS50eXBlID09PSBOb2RlVHlwZXMuRUxFTUVOVCkge1xyXG4gICAgcmV0dXJuICgpID0+IHtcclxuICAgICAgLy8g5Lit6Ze05aSE55CG5bGCXHJcblxyXG4gICAgICAvLyB0YWdcclxuICAgICAgY29uc3Qgdm5vZGVUYWcgPSBgXCIke25vZGUudGFnfVwiYFxyXG4gICAgICAvLyBwcm9wc1xyXG4gICAgICBjb25zdCB2bm9kZVByb3BzID0gbnVsbFxyXG4gICAgICAvLyBjaGlsZHJlblxyXG4gICAgICBjb25zdCBjaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW5cclxuICAgICAgY29uc3Qgdm5vZGVDaGlsZHJlbiA9IGNoaWxkcmVuWzBdXHJcblxyXG4gICAgICBub2RlLmNvZGVnZW5Ob2RlID0gY3JlYXRlVk5vZGVDYWxsKFxyXG4gICAgICAgIGNvbnRleHQsXHJcbiAgICAgICAgbm9kZS50eXBlLFxyXG4gICAgICAgIHZub2RlVGFnLFxyXG4gICAgICAgIHZub2RlUHJvcHMsXHJcbiAgICAgICAgdm5vZGVDaGlsZHJlblxyXG4gICAgICApXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB7IE5vZGVUeXBlcyB9IGZyb20gXCIuLi9hc3RcIlxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHRyYW5zZm9ybUV4cHJlc3Npb24obm9kZSkge1xyXG4gIGlmIChub2RlLnR5cGUgPT09IE5vZGVUeXBlcy5JTlRFUlBPTEFUSU9OKSB7XHJcbiAgICBwcm9jZXNzRXhwcmVzc2lvbihub2RlLmNvbnRlbnQpXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBwcm9jZXNzRXhwcmVzc2lvbihub2RlKSB7XHJcbiAgbm9kZS5jb250ZW50ID0gYF9jdHguJHtub2RlLmNvbnRlbnR9YFxyXG59XHJcbiIsImltcG9ydCB7IEVsZW1lbnQsIE5vZGVUeXBlcyB9IGZyb20gXCIuL2FzdFwiXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNUZXh0KG5vZGU6IEVsZW1lbnQpIHtcclxuICByZXR1cm4gbm9kZS50eXBlID09PSBOb2RlVHlwZXMuVEVYVCB8fCBub2RlLnR5cGUgPT09IE5vZGVUeXBlcy5JTlRFUlBPTEFUSU9OXHJcbn1cclxuIiwiaW1wb3J0IHsgRWxlbWVudCwgTm9kZVR5cGVzIH0gZnJvbSBcIi4uL2FzdFwiXHJcbmltcG9ydCB7IGlzVGV4dCB9IGZyb20gXCIuLi91dGlsc1wiXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdHJhbnNmb3JtVGV4dChub2RlOiBFbGVtZW50KSB7XHJcbiAgaWYgKG5vZGUudHlwZSA9PT0gTm9kZVR5cGVzLkVMRU1FTlQpIHtcclxuICAgIHJldHVybiAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHsgY2hpbGRyZW4gfSA9IG5vZGVcclxuICAgICAgbGV0IGN1cnJlbnRDb250YWluZXJcclxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoaWxkID0gY2hpbGRyZW5baV1cclxuICAgICAgICBpZiAoaXNUZXh0KGNoaWxkKSkge1xyXG4gICAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgY2hpbGRyZW4ubGVuZ3RoOyBqKyspIHtcclxuICAgICAgICAgICAgY29uc3QgbmV4dENoaWxkID0gY2hpbGRyZW5bal1cclxuICAgICAgICAgICAgaWYgKGlzVGV4dChuZXh0Q2hpbGQpKSB7XHJcbiAgICAgICAgICAgICAgaWYgKCFjdXJyZW50Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50Q29udGFpbmVyID0gY2hpbGRyZW5baV0gPSB7XHJcbiAgICAgICAgICAgICAgICAgIHR5cGU6IE5vZGVUeXBlcy5DT01QT1VORF9FWFBSRVNTSU9OLFxyXG4gICAgICAgICAgICAgICAgICBjaGlsZHJlbjogW2NoaWxkXSxcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgY3VycmVudENvbnRhaW5lci5jaGlsZHJlbi5wdXNoKFwiICsgXCIpXHJcbiAgICAgICAgICAgICAgY3VycmVudENvbnRhaW5lci5jaGlsZHJlbi5wdXNoKG5leHRDaGlsZClcclxuICAgICAgICAgICAgICBjaGlsZHJlbi5zcGxpY2UoaiwgMSlcclxuICAgICAgICAgICAgICBqLS1cclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICBjdXJyZW50Q29udGFpbmVyID0gdW5kZWZpbmVkXHJcbiAgICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgeyBnZW5lcmF0ZSB9IGZyb20gXCIuL2NvZGVnZW5cIlxyXG5pbXBvcnQgeyBiYXNlUGFyc2UgfSBmcm9tIFwiLi9wYXJzZVwiXHJcbmltcG9ydCB7IHRyYW5zZm9ybSB9IGZyb20gXCIuL3RyYW5zZm9ybVwiXHJcbmltcG9ydCB7IHRyYW5zZm9ybUVsZW1lbnQgfSBmcm9tIFwiLi90cmFuc2Zvcm1zL3RyYW5zZm9ybUVsZW1lbnRcIlxyXG5pbXBvcnQgeyB0cmFuc2Zvcm1FeHByZXNzaW9uIH0gZnJvbSBcIi4vdHJhbnNmb3Jtcy90cmFuc2Zvcm1FeHByZXNzaW9uXCJcclxuaW1wb3J0IHsgdHJhbnNmb3JtVGV4dCB9IGZyb20gXCIuL3RyYW5zZm9ybXMvdHJhbnNmb3JtVGV4dFwiXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYmFzZUNvbXBpbGUodGVtcGxhdGU6IHN0cmluZykge1xyXG4gIGNvbnN0IGFzdCA9IGJhc2VQYXJzZSh0ZW1wbGF0ZSlcclxuICB0cmFuc2Zvcm0oYXN0IGFzIGFueSwge1xyXG4gICAgbm9kZVRyYW5zZm9ybXM6IFtcclxuICAgICAgdHJhbnNmb3JtRXhwcmVzc2lvbixcclxuICAgICAgdHJhbnNmb3JtRWxlbWVudCBhcyBhbnksXHJcbiAgICAgIHRyYW5zZm9ybVRleHQsXHJcbiAgICBdLFxyXG4gIH0pXHJcblxyXG4gIHJldHVybiBnZW5lcmF0ZShhc3QpXHJcbn1cclxuIiwiLy8gbWluLXZ1ZeWHuuWPo1xyXG5leHBvcnQgKiBmcm9tIFwiQG1pbi12dWUvcnVudGltZS1kb21cIlxyXG5cclxuaW1wb3J0IHsgYmFzZUNvbXBpbGUgfSBmcm9tIFwiQG1pbi12dWUvY29tcGlsZXItY29yZVwiXHJcbmltcG9ydCAqIGFzIHJ1bnRpbWVEb20gZnJvbSBcIkBtaW4tdnVlL3J1bnRpbWUtZG9tXCJcclxuaW1wb3J0IHsgcmVnaXN0ZXJSdW50aW1lQ29tcGlsZXIgfSBmcm9tIFwiQG1pbi12dWUvcnVudGltZS1kb21cIlxyXG5cclxuZnVuY3Rpb24gY29tcGlsZVRvRnVuY3Rpb24odGVtcGxhdGUpIHtcclxuICBjb25zdCB7IGNvZGUgfSA9IGJhc2VDb21waWxlKHRlbXBsYXRlKVxyXG5cclxuICBjb25zdCByZW5kZXIgPSBuZXcgRnVuY3Rpb24oXCJWdWVcIiwgY29kZSkocnVudGltZURvbSlcclxuXHJcbiAgcmV0dXJuIHJlbmRlclxyXG59XHJcblxyXG5yZWdpc3RlclJ1bnRpbWVDb21waWxlcihjb21waWxlVG9GdW5jdGlvbilcclxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQU0sU0FBVSxlQUFlLENBQUMsR0FBRyxFQUFBO0FBQ2pDLElBQUEsT0FBTyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDcEI7O1NDQWdCLE1BQU0sQ0FBQyxNQUFNLEVBQUUsR0FBRyxNQUFNLEVBQUE7SUFDdEMsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxDQUFBO0FBQ3pDLENBQUM7QUFFSyxTQUFVLFFBQVEsQ0FBQyxLQUFLLEVBQUE7SUFDNUIsT0FBTyxLQUFLLEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsQ0FBQTtBQUNwRCxDQUFDO0FBRUssU0FBVSxRQUFRLENBQUMsS0FBSyxFQUFBO0FBQzVCLElBQUEsT0FBTyxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUE7QUFDbEMsQ0FBQztBQUVLLFNBQVUsT0FBTyxDQUFDLEtBQUssRUFBQTtBQUMzQixJQUFBLE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxL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
