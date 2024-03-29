import { reactive } from "../src/reactive"
import { effect, stop } from "../src/effect"
import { vi } from "vitest"

describe("effect", () => {
  it("effect里的函数读取一个响应式变量时，可以被收集起来，并且当响应式变量发生变化，能够重新执行", () => {
    const user = reactive({
      age: 10,
    })

    let nextAge
    effect(() => {
      nextAge = user.age
    })

    expect(nextAge).toBe(10)

    // update
    user.age++
    expect(nextAge).toBe(11)
    user.age++
    expect(nextAge).toBe(12)
  })

  it("当调用effect的时候应该return一个runner，runner就是传给effect的函数，并且runner执行结果是函数里的返回值", () => {
    let foo = 10
    const runner = effect(() => {
      foo++
      return "foo"
    })

    expect(foo).toBe(11)
    const res = runner()
    expect(foo).toBe(12)
    expect(res).toBe("foo")
  })

  it("effect支持schedule调度器功能", () => {
    // 1. effect 第一次执行的时候，会执行fn，不执行scheduler
    // 2. 当响应式对象更新时，不会执行fn，而是执行scheduler
    // 3. 当执行runner时，会再次执行fn
    let dummy
    let run: any
    const scheduler = vi.fn(() => {
      run = runner
    })
    const obj = reactive({ foo: 1 })
    const runner = effect(
      () => {
        dummy = obj.foo
      },
      { scheduler }
    )
    expect(scheduler).not.toHaveBeenCalled()
    expect(dummy).toBe(1)

    obj.foo++
    expect(scheduler).toHaveBeenCalledTimes(1)
    expect(dummy).toBe(1)

    run()
    expect(dummy).toBe(2)
  })

  it("stop停止触发依赖, 当调用stop时，onStop会执行", () => {
    // 当调用stop后，响应式变量更新时，fn也不再执行
    // 调用runner后，fn才会执行
    // 当调用stop时，onStop会执行
    let dummy
    const obj = reactive({ prop: 1 })
    const onStop = vi.fn(() => {})
    const runner = effect(
      () => {
        dummy = obj.prop
      },
      {
        onStop,
      }
    )

    obj.prop = 2
    expect(dummy).toBe(2)

    stop(runner)
    obj.prop++
    obj.prop = 3
    expect(dummy).toBe(2)
    expect(onStop).toHaveBeenCalledTimes(1)

    runner()
    expect(dummy).toBe(3)
  })

  it("嵌套effect", () => {
    const data = { foo: true, bar: true }
    const obj = reactive(data)
    let temp1, temp2
    const effectFn1 = vi.fn()
    const effectFn2 = vi.fn()
    effect(() => {
      effect(() => {
        temp2 = obj.bar
        effectFn2()
      })
      temp1 = obj.foo
      effectFn1()
    })

    obj.bar = false
    expect(effectFn1).toHaveBeenCalledTimes(1)
    expect(effectFn2).toHaveBeenCalledTimes(2)
  })

  it.skip("嵌套effect", () => {
    const data = { foo: true, bar: true }
    const obj = reactive(data)
    let temp1, temp2
    const effectFn1 = vi.fn()
    const effectFn2 = vi.fn()
    effect(() => {
      effect(() => {
        temp2 = obj.bar
        effectFn2()
      })
      temp1 = obj.foo
      effectFn1()
    })

    obj.foo = false
    expect(effectFn1).toHaveBeenCalledTimes(2)
    expect(effectFn2).toHaveBeenCalledTimes(2)
  })
})
