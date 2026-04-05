# svelte-store

Pinia 风格的 Svelte 5 状态管理库，基于 `svelte/store` 构建。

## 特性

- 🏪 **Pinia 风格 API** — `defineStore` 定义 store，支持 Options API 和 Setup 风格
- 📦 **基于 svelte/store** — 完全兼容 Svelte 生态，支持 `$store` 自动订阅
- 🔌 **插件系统** — 支持全局插件，可扩展持久化、日志等功能
- 🎯 **TypeScript** — 完整类型推导
- ⚡ **轻量** — 零额外依赖，仅依赖 `svelte/store`

## 安装

```bash
npm install svelte-store
```

## 快速开始

### Options API 风格

```ts
import { defineStore } from 'svelte-store'

export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
    name: 'Counter',
  }),
  getters: {
    doubleCount: (state) => state.count * 2,
    displayName: (state) => `${state.name}: ${state.count}`,
  },
  actions: {
    increment() {
      this.$patch({ count: this.$state.count + 1 })
    },
    decrement() {
      this.$patch({ count: this.$state.count - 1 })
    },
    incrementBy(amount: number) {
      this.$patch({ count: this.$state.count + amount })
    },
  },
})
```

### Setup 风格

```ts
import { defineStore, writable, derived } from 'svelte-store'

export const useCounterStore = defineStore('counter', () => {
  const count = writable(0)
  const doubleCount = derived(count, ($count) => $count * 2)

  function increment() {
    count.update((n) => n + 1)
  }

  function decrement() {
    count.update((n) => n - 1)
  }

  return { count, doubleCount, increment, decrement }
})
```

### 在组件中使用

```svelte
<script>
  import { useCounterStore } from '../stores/counter'

  const counter = useCounterStore()
</script>

<p>Count: {counter.$state.count}</p>
<p>Double: {counter.doubleCount}</p>

<button onclick={() => counter.increment()}>+</button>
<button onclick={() => counter.decrement()}>-</button>
```

## Store 实例 API

| 方法 / 属性 | 说明 |
|---|---|
| `$id` | Store 的唯一标识字符串 |
| `$state` | 获取当前 state 快照 |
| `$patch(partial)` | 批量更新 state（对象或函数） |
| `$reset()` | 重置 state 到初始值（仅 Options API） |
| `$subscribe(callback)` | 监听 state 变化，返回取消订阅函数 |
| `subscribe(run)` | svelte/store 标准订阅接口 |

### $patch 用法

```ts
// 对象方式
counter.$patch({ count: 10 })

// 函数方式
counter.$patch((state) => {
  state.count++
  state.name = 'Updated'
})
```

### $subscribe 用法

```ts
const unsubscribe = counter.$subscribe((state) => {
  console.log('state 变化:', state)
})

// 需要时取消订阅
unsubscribe()
```

## 插件系统

```ts
import { addPlugin } from 'svelte-store'

// 持久化插件示例
addPlugin(({ store, storeId }) => {
  // 恢复持久化数据
  const key = `svelte-store-${storeId}`
  const saved = localStorage.getItem(key)
  if (saved) {
    try {
      store.$patch(JSON.parse(saved))
    } catch {}
  }

  // 监听变化并持久化
  store.$subscribe((state) => {
    localStorage.setItem(key, JSON.stringify(state))
  })
})

// 日志插件示例
addPlugin(({ store, storeId }) => {
  store.$subscribe((state) => {
    console.log(`[${storeId}]`, state)
  })
})
```

## 辅助函数

### mapState

从 store 中提取状态为独立的 Readable store：

```ts
import { mapState } from 'svelte-store'

const { count, name } = mapState(useCounterStore, ['count', 'name'])
// count 和 name 是 Readable<number> 和 Readable<string>
```

### mapActions

从 store 中提取 actions 为独立函数：

```ts
import { mapActions } from 'svelte-store'

const { increment, decrement } = mapActions(useCounterStore, ['increment', 'decrement'])
increment() // 直接调用
```

## 兼容性

| 格式 | 文件 | 用途 |
|---|---|---|
| ESM | `dist/svelte-store.mjs` | `import` 语法 |
| CJS | `dist/svelte-store.cjs` | `require()` 语法 |
| Svelte 源码 | `src/index.ts` | Svelte 项目直接引用 |

## License

MIT
