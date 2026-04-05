/**
 * svelte-store — Pinia 风格的 Svelte 5 状态管理库
 *
 * 核心概念：
 * - defineStore：定义一个 store（类似 Pinia 的 defineStore）
 * - state：响应式数据
 * - getters：派生计算属性
 * - actions：修改 state 的方法
 * - plugins：全局插件系统
 * - $subscribe：监听 state 变化
 * - $patch：批量更新 state
 * - $reset：重置 state 到初始值
 */

import { writable, derived, get, readonly } from 'svelte/store'
import type { Writable, Readable, Unsubscriber } from 'svelte/store'

// ==================== 类型定义 ====================

/** Store 的 state 工厂函数 */
export type StateFactory<S> = () => S

/** Store 的 getters 定义 */
export type GettersDefinition<S, G> = {
    [K in keyof G]: (state: S) => G[K]
}

/** Store 的 actions 定义 */
export type ActionsDefinition<S, A> = {
    [K in keyof A]: A[K] extends (...args: infer P) => infer R
    ? (this: StoreInstance<S, any, A>, ...args: P) => R
    : never
}

/** Store Options API 风格定义 */
export interface StoreOptionsDefinition<
    Id extends string,
    S extends Record<string, any>,
    G extends Record<string, any>,
    A extends Record<string, (...args: any[]) => any>,
> {
    id?: Id
    state?: StateFactory<S>
    getters?: GettersDefinition<S, G>
    actions?: A
}

/** Setup 风格返回值 */
export type SetupReturn = Record<string, any>

/** Store 实例 */
export interface StoreInstance<
    S extends Record<string, any>,
    G extends Record<string, any>,
    A extends Record<string, (...args: any[]) => any>,
> {
    /** Store 唯一标识 */
    $id: string
    /** 订阅 state 变化 */
    $subscribe: (callback: (state: S) => void) => Unsubscriber
    /** 批量更新 state */
    $patch: (partialOrUpdater: Partial<S> | ((state: S) => void)) => void
    /** 重置 state 到初始值 */
    $reset: () => void
    /** 获取当前 state 快照 */
    $state: S
    /** svelte/store 订阅接口 */
    subscribe: (run: (value: S) => void) => Unsubscriber
}

/** 插件上下文 */
export interface PluginContext<S = any> {
    store: StoreInstance<S, any, any>
    storeId: string
    options: StoreOptionsDefinition<string, S, any, any>
}

/** 插件类型 */
export type StorePlugin = (context: PluginContext) => void | Record<string, any>

// ==================== 全局状态 ====================

/** 已注册的所有 store */
const storeRegistry = new Map<string, any>()

/** 已注册的插件 */
const plugins: StorePlugin[] = []

// ==================== 核心 API ====================

/**
 * 定义一个 Store（Options API 风格）
 *
 * @example
 * ```ts
 * const useCounterStore = defineStore('counter', {
 *   state: () => ({ count: 0 }),
 *   getters: {
 *     double: (state) => state.count * 2,
 *   },
 *   actions: {
 *     increment() { this.$patch({ count: this.$state.count + 1 }) },
 *     decrement() { this.$patch({ count: this.$state.count - 1 }) },
 *   },
 * })
 *
 * // 在组件中使用
 * const counter = useCounterStore()
 * $: console.log($counter) // { count: 0 }
 * counter.increment()
 * ```
 */
export function defineStore<
    Id extends string,
    S extends Record<string, any> = {},
    G extends Record<string, any> = {},
    A extends Record<string, (...args: any[]) => any> = {},
>(
    id: Id,
    options: StoreOptionsDefinition<Id, S, G, A>,
): () => StoreInstance<S, G, A> & S & { [K in keyof G]: G[K] } & A

/**
 * 定义一个 Store（Setup 风格）
 *
 * @example
 * ```ts
 * const useCounterStore = defineStore('counter', () => {
 *   let count = writable(0)
 *   const double = derived(count, $c => $c * 2)
 *   function increment() { count.update(n => n + 1) }
 *   return { count, double, increment }
 * })
 * ```
 */
export function defineStore<Id extends string>(
    id: Id,
    setup: () => SetupReturn,
): () => any

export function defineStore(
    id: string,
    optionsOrSetup: StoreOptionsDefinition<string, any, any, any> | (() => SetupReturn),
) {
    return function useStore() {
        // 单例：同一 id 只创建一次
        if (storeRegistry.has(id)) {
            return storeRegistry.get(id)
        }

        let store: any

        if (typeof optionsOrSetup === 'function') {
            // Setup 风格
            store = createSetupStore(id, optionsOrSetup)
        } else {
            // Options API 风格
            store = createOptionsStore(id, optionsOrSetup)
        }

        storeRegistry.set(id, store)

        // 执行插件
        for (const plugin of plugins) {
            const extensions = plugin({
                store,
                storeId: id,
                options: typeof optionsOrSetup === 'function' ? { id } : optionsOrSetup,
            })
            if (extensions) {
                Object.assign(store, extensions)
            }
        }

        return store
    }
}

// ==================== Options Store 创建 ====================

function createOptionsStore(
    id: string,
    options: StoreOptionsDefinition<string, any, any, any>,
) {
    const initialState = options.state ? options.state() : {}
    const stateStore: Writable<any> = writable({ ...initialState })

    // 构建 store 实例
    const store: any = {
        $id: id,
        subscribe: stateStore.subscribe,

        get $state() {
            return get(stateStore)
        },

        $patch(partialOrUpdater: any) {
            stateStore.update((current: any) => {
                if (typeof partialOrUpdater === 'function') {
                    partialOrUpdater(current)
                    return { ...current }
                }
                return { ...current, ...partialOrUpdater }
            })
        },

        $reset() {
            const freshState = options.state ? options.state() : {}
            stateStore.set({ ...freshState })
        },

        $subscribe(callback: (state: any) => void) {
            return stateStore.subscribe(callback)
        },
    }

    // 绑定 getters
    if (options.getters) {
        for (const [key, getter] of Object.entries(options.getters)) {
            Object.defineProperty(store, key, {
                get() {
                    return (getter as Function)(get(stateStore))
                },
                enumerable: true,
            })
        }
    }

    // 绑定 actions（this 指向 store 实例）
    if (options.actions) {
        for (const [key, action] of Object.entries(options.actions)) {
            store[key] = (...args: any[]) => (action as Function).apply(store, args)
        }
    }

    return store
}

// ==================== Setup Store 创建 ====================

function createSetupStore(id: string, setup: () => SetupReturn) {
    const result = setup()
    const stateStore: Writable<any> = writable({})

    // 分离 stores、computed 和 actions
    const storeEntries: Record<string, Writable<any>> = {}
    const readableEntries: Record<string, Readable<any>> = {}
    const actionEntries: Record<string, Function> = {}

    for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'function') {
            actionEntries[key] = value
        } else if (value && typeof value === 'object' && 'subscribe' in value) {
            if ('set' in value) {
                storeEntries[key] = value as Writable<any>
            } else {
                readableEntries[key] = value as Readable<any>
            }
        }
    }

    // 同步 state snapshot
    function syncState() {
        const state: any = {}
        for (const [key, s] of Object.entries(storeEntries)) {
            state[key] = get(s)
        }
        for (const [key, s] of Object.entries(readableEntries)) {
            state[key] = get(s)
        }
        stateStore.set(state)
    }

    // 订阅所有 writable stores 的变化
    const unsubs: Unsubscriber[] = []
    for (const s of Object.values(storeEntries)) {
        unsubs.push(s.subscribe(() => syncState()))
    }
    for (const s of Object.values(readableEntries)) {
        unsubs.push(s.subscribe(() => syncState()))
    }

    const store: any = {
        $id: id,
        subscribe: stateStore.subscribe,

        get $state() {
            return get(stateStore)
        },

        $patch(partialOrUpdater: any) {
            if (typeof partialOrUpdater === 'function') {
                const current: any = {}
                for (const [key, s] of Object.entries(storeEntries)) {
                    current[key] = get(s)
                }
                partialOrUpdater(current)
                for (const [key, s] of Object.entries(storeEntries)) {
                    if (key in current) s.set(current[key])
                }
            } else {
                for (const [key, value] of Object.entries(partialOrUpdater)) {
                    if (key in storeEntries) {
                        storeEntries[key].set(value)
                    }
                }
            }
        },

        $reset() {
            // Setup store 没有初始工厂，不支持 $reset
            console.warn(`[svelte-store] Setup store "${id}" 不支持 $reset，请手动重置状态`)
        },

        $subscribe(callback: (state: any) => void) {
            return stateStore.subscribe(callback)
        },
    }

    // 暴露 actions
    for (const [key, action] of Object.entries(actionEntries)) {
        store[key] = action
    }

    // 暴露 writable stores（通过 getter/setter 代理）
    for (const [key, s] of Object.entries(storeEntries)) {
        Object.defineProperty(store, key, {
            get() { return get(s) },
            set(value: any) { s.set(value) },
            enumerable: true,
        })
    }

    // 暴露 readable stores（通过 getter）
    for (const [key, s] of Object.entries(readableEntries)) {
        Object.defineProperty(store, key, {
            get() { return get(s) },
            enumerable: true,
        })
    }

    return store
}

// ==================== 插件系统 ====================

/**
 * 注册全局插件
 *
 * @example
 * ```ts
 * import { addPlugin } from 'svelte-store'
 *
 * // 持久化插件
 * addPlugin(({ store, storeId }) => {
 *   const saved = localStorage.getItem(`store-${storeId}`)
 *   if (saved) store.$patch(JSON.parse(saved))
 *   store.$subscribe((state) => {
 *     localStorage.setItem(`store-${storeId}`, JSON.stringify(state))
 *   })
 * })
 * ```
 */
export function addPlugin(plugin: StorePlugin): void {
    plugins.push(plugin)
}

// ==================== 工具函数 ====================

/**
 * 获取已注册的 store 实例（需先调用过 useStore）
 */
export function getRegisteredStore(id: string): any | undefined {
    return storeRegistry.get(id)
}

/**
 * 清除所有已注册的 store（测试用）
 */
export function clearStores(): void {
    storeRegistry.clear()
}

/**
 * 创建 store 映射辅助函数
 * 类似 Pinia 的 mapState
 *
 * @example
 * ```ts
 * const useCounter = defineStore('counter', {
 *   state: () => ({ count: 0, name: 'Counter' }),
 * })
 *
 * // mapState 提取部分 state
 * const { count, name } = mapState(useCounter, ['count', 'name'])
 * ```
 */
export function mapState<S extends Record<string, any>>(
    useStore: () => any,
    keys: (keyof S)[],
): Record<keyof S, Readable<any>> {
    const store = useStore()
    const result: any = {}
    for (const key of keys) {
        result[key] = derived({ subscribe: store.subscribe }, ($state: S) => $state[key])
    }
    return result
}

/**
 * 转发 store 中的 actions
 *
 * @example
 * ```ts
 * const { increment, decrement } = mapActions(useCounter, ['increment', 'decrement'])
 * ```
 */
export function mapActions(
    useStore: () => any,
    keys: string[],
): Record<string, (...args: any[]) => any> {
    const store = useStore()
    const result: any = {}
    for (const key of keys) {
        if (typeof store[key] === 'function') {
            result[key] = store[key].bind(store)
        }
    }
    return result
}

// 重新导出 svelte/store 常用 API
export { writable, readable, derived, get, readonly } from 'svelte/store'
export type { Writable, Readable, Unsubscriber } from 'svelte/store'
