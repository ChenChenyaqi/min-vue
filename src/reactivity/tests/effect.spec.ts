import { reactive } from "../reactive"
import { effect, stop } from "../effect"

describe("effect", () => {
  it("effect里的函数读取一个响应式变量时，可以被收集起来，并且当响应式变量发生变化，能够重新执行", () => {
    const user = reactive({
      age: 10,
    })

    let nextAge
    effect(() => {
      user.age++
      nextAge = user.age
    })

    expect(nextAge).toBe(11)

    // update
    user.age++
    expect(nextAge).toBe(13)
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
    const scheduler = jest.fn(() => {
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
    const onStop = jest.fn(() => {})
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
    obj.prop = 3
    expect(dummy).toBe(2)
    expect(onStop).toHaveBeenCalledTimes(1)

    runner()
    expect(dummy).toBe(3)
  })
})
