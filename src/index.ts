/**
 * @free-walk/svelte-store — Pinia 风格的 Svelte 5 状态管理库
 *
 * 核心概念：
 * - defineStore：定义一个 store（类似 Pinia 的 defineStore）
 * - state：响应式数据
 * - getters：派生计算属性（使用 derived 缓存）
 * - actions：修改 state 的方法
 * - plugins：全局插件系统
 * - $subscribe：监听 state 变化（跳过初始值，仅在变更时触发）
 * - $patch：批量更新 state
 * - $reset：重置 state 到初始值
 * - $dispose：销毁 store，清理所有订阅
 * - $onAction：监听 action 调用
 * - storeToRefs：将 store 属性转为独立的 readable stores
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

/** Action 监听回调 */
export interface ActionContext {
    name: string
    args: any[]
    after: (callback: (result: any) => void) => void
    onError: (callback: (error: any) => void) => void
}

export type OnActionCallback = (context: ActionContext) => void

/** Store 实例 */
export interface StoreInstance<
    S extends Record<string, any>,
    G extends Record<string, any>,
    A extends Record<string, (...args: any[]) => any>,
> {
    /** Store 唯一标识 */
    $id: string
    /** 订阅 state 变化（跳过初始值，仅变更时触发） */
    $subscribe: (callback: (state: S) => void) => Unsubscriber
    /** 批量更新 state */
    $patch: (partialOrUpdater: Partial<S> | ((state: S) => void)) => void
    /** 重置 state 到初始值 */
    $reset: () => void
    /** 获取当前 state 快照 */
    $state: S
    /** 销毁 store，清理所有订阅 */
    $dispose: () => void
    /** 监听 action 调用 */
    $onAction: (callback: OnActionCallback) => Unsubscriber
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

/** store 销毁回调 */
const disposeCallbacks = new Map<string, (() => void)[]>()

// ==================== 核心 API ====================

/**
 * 定义一个 Store（Options API 风格）
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
            store = createSetupStore(id, optionsOrSetup)
        } else {
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
    const actionListeners: OnActionCallback[] = []
    const cleanups: Unsubscriber[] = []

    // 构建 store 实例
    const store: any = {
        $id: id,
        subscribe: stateStore.subscribe,

        get $state() {
            return get(stateStore)
        },

        set $state(newState: any) {
            stateStore.set({ ...newState })
        },

        $patch(partialOrUpdater: any) {
            stateStore.update((current: any) => {
                if (typeof partialOrUpdater === 'function') {
                    // 使用深拷贝确保变更被检测到
                    const draft = { ...current }
                    partialOrUpdater(draft)
                    return draft
                }
                return { ...current, ...partialOrUpdater }
            })
        },

        $reset() {
            const freshState = options.state ? options.state() : {}
            stateStore.set({ ...freshState })
        },

        $subscribe(callback: (state: any) => void) {
            let isFirst = true
            const unsub = stateStore.subscribe((state) => {
                if (isFirst) {
                    isFirst = false
                    return
                }
                callback(state)
            })
            return unsub
        },

        $dispose() {
            for (const cleanup of cleanups) {
                try { cleanup() } catch (_) { /* ignore */ }
            }
            cleanups.length = 0
            actionListeners.length = 0
            storeRegistry.delete(id)
            const cbs = disposeCallbacks.get(id)
            if (cbs) {
                for (const cb of cbs) try { cb() } catch (_) { /* ignore */ }
                disposeCallbacks.delete(id)
            }
        },

        $onAction(callback: OnActionCallback) {
            actionListeners.push(callback)
            return () => {
                const idx = actionListeners.indexOf(callback)
                if (idx > -1) actionListeners.splice(idx, 1)
            }
        },
    }

    // 绑定 getters（使用 derived 缓存）
    if (options.getters) {
        for (const [key, getter] of Object.entries(options.getters)) {
            const derivedStore = derived(stateStore, ($state) => (getter as Function)($state))
            cleanups.push(derivedStore.subscribe(() => {})) // keep alive
            Object.defineProperty(store, key, {
                get() {
                    return get(derivedStore)
                },
                enumerable: true,
            })
        }
    }

    // 绑定 actions（this 指向 store 实例，支持 $onAction 监听）
    if (options.actions) {
        for (const [key, action] of Object.entries(options.actions)) {
            store[key] = (...args: any[]) => {
                let afterCallbacks: ((result: any) => void)[] = []
                let errorCallbacks: ((error: any) => void)[] = []

                // 通知 action 监听者
                for (const listener of actionListeners) {
                    listener({
                        name: key,
                        args,
                        after: (cb) => afterCallbacks.push(cb),
                        onError: (cb) => errorCallbacks.push(cb),
                    })
                }

                try {
                    const result = (action as Function).apply(store, args)
                    // 处理 async actions
                    if (result instanceof Promise) {
                        return result.then((res: any) => {
                            for (const cb of afterCallbacks) try { cb(res) } catch (_) { /* ignore */ }
                            return res
                        }).catch((err: any) => {
                            for (const cb of errorCallbacks) try { cb(err) } catch (_) { /* ignore */ }
                            throw err
                        })
                    }
                    for (const cb of afterCallbacks) try { cb(result) } catch (_) { /* ignore */ }
                    return result
                } catch (err) {
                    for (const cb of errorCallbacks) try { cb(err) } catch (_) { /* ignore */ }
                    throw err
                }
            }
        }
    }

    return store
}

// ==================== Setup Store 创建 ====================

function createSetupStore(id: string, setup: () => SetupReturn) {
    const result = setup()
    const stateStore: Writable<any> = writable({})
    const actionListeners: OnActionCallback[] = []
    const cleanups: Unsubscriber[] = []

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

    // 同步 state snapshot（批量，避免多次触发）
    let syncScheduled = false
    function scheduleSyncState() {
        if (syncScheduled) return
        syncScheduled = true
        queueMicrotask(() => {
            syncScheduled = false
            syncState()
        })
    }

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

    // 初始同步
    syncState()

    // 订阅所有 writable stores 的变化
    for (const s of Object.values(storeEntries)) {
        cleanups.push(s.subscribe(() => scheduleSyncState()))
    }
    for (const s of Object.values(readableEntries)) {
        cleanups.push(s.subscribe(() => scheduleSyncState()))
    }

    const store: any = {
        $id: id,
        subscribe: stateStore.subscribe,

        get $state() {
            return get(stateStore)
        },

        $patch(partialOrUpdater: any) {
            if (typeof partialOrUpdater === 'function') {
                // 对 setup store 用 function patch: 获取当前值，修改后写回
                const current: any = {}
                for (const [key, s] of Object.entries(storeEntries)) {
                    current[key] = get(s)
                }
                partialOrUpdater(current)
                // 写回所有值（使用 JSON 深比较避免不必要更新）
                for (const [key, s] of Object.entries(storeEntries)) {
                    if (key in current) {
                        const newVal = current[key]
                        const oldVal = get(s)
                        // 强制设置，即使是同一引用（用户可能修改了对象内部）
                        s.set(newVal)
                    }
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
            console.warn(`[svelte-store] Setup store "${id}" 不支持 $reset，请手动重置状态`)
        },

        $subscribe(callback: (state: any) => void) {
            let isFirst = true
            const unsub = stateStore.subscribe((state) => {
                if (isFirst) {
                    isFirst = false
                    return
                }
                callback(state)
            })
            return unsub
        },

        $dispose() {
            for (const cleanup of cleanups) {
                try { cleanup() } catch (_) { /* ignore */ }
            }
            cleanups.length = 0
            actionListeners.length = 0
            storeRegistry.delete(id)
            const cbs = disposeCallbacks.get(id)
            if (cbs) {
                for (const cb of cbs) try { cb() } catch (_) { /* ignore */ }
                disposeCallbacks.delete(id)
            }
        },

        $onAction(callback: OnActionCallback) {
            actionListeners.push(callback)
            return () => {
                const idx = actionListeners.indexOf(callback)
                if (idx > -1) actionListeners.splice(idx, 1)
            }
        },
    }

    // 暴露 actions（包装以支持 $onAction）
    for (const [key, action] of Object.entries(actionEntries)) {
        store[key] = (...args: any[]) => {
            let afterCallbacks: ((result: any) => void)[] = []
            let errorCallbacks: ((error: any) => void)[] = []

            for (const listener of actionListeners) {
                listener({
                    name: key,
                    args,
                    after: (cb) => afterCallbacks.push(cb),
                    onError: (cb) => errorCallbacks.push(cb),
                })
            }

            try {
                const result = (action as Function)(...args)
                if (result instanceof Promise) {
                    return result.then((res: any) => {
                        for (const cb of afterCallbacks) try { cb(res) } catch (_) { /* ignore */ }
                        return res
                    }).catch((err: any) => {
                        for (const cb of errorCallbacks) try { cb(err) } catch (_) { /* ignore */ }
                        throw err
                    })
                }
                for (const cb of afterCallbacks) try { cb(result) } catch (_) { /* ignore */ }
                return result
            } catch (err) {
                for (const cb of errorCallbacks) try { cb(err) } catch (_) { /* ignore */ }
                throw err
            }
        }
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
 * import { addPlugin } from '@free-walk/svelte-store'
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
    // 对已注册的 stores 也执行新插件
    for (const [storeId, store] of storeRegistry.entries()) {
        const extensions = plugin({ store, storeId, options: { id: storeId } })
        if (extensions) {
            Object.assign(store, extensions)
        }
    }
}

// ==================== 工具函数 ====================

/**
 * 获取已注册的 store 实例（需先调用过 useStore）
 */
export function getRegisteredStore(id: string): any | undefined {
    return storeRegistry.get(id)
}

/**
 * 清除所有已注册的 store（先调用 $dispose 清理订阅）
 */
export function clearStores(): void {
    for (const store of storeRegistry.values()) {
        if (typeof store.$dispose === 'function') {
            try { store.$dispose() } catch (_) { /* ignore */ }
        }
    }
    storeRegistry.clear()
}

/**
 * 将 store 属性转为独立的 readable stores（类似 Pinia 的 storeToRefs）
 *
 * @example
 * ```ts
 * const counter = useCounterStore()
 * const { count, double } = storeToRefs(counter)
 * // count 和 double 都是 Readable<T>
 * ```
 */
export function storeToRefs<S extends Record<string, any>>(
    store: any,
): Record<string, Readable<any>> {
    const refs: Record<string, Readable<any>> = {}
    const storeSubscribe = store.subscribe

    for (const key of Object.keys(store)) {
        if (key.startsWith('$') || typeof store[key] === 'function') continue
        refs[key] = derived(
            { subscribe: storeSubscribe },
            ($state: any) => $state[key],
        )
    }

    return refs
}

/**
 * 创建 store 映射辅助函数
 * 类似 Pinia 的 mapState
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
