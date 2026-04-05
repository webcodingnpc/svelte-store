# @free-walk/svelte-store

A Pinia-style state management library for Svelte 5, built on `svelte/store`.

[中文文档](./README.zh-CN.md)

## Features

- **Pinia-style API** — `defineStore` with Options API and Setup style support
- **Built on svelte/store** — fully compatible with Svelte ecosystem, supports `$store` auto-subscription
- **Plugin system** — global plugins for persistence, logging, and more
- **TypeScript** — full type inference
- **Lightweight** — zero extra dependencies, relies only on `svelte/store`

## Installation

```bash
npm install @free-walk/svelte-store
```

## Quick Start

### Options API Style

```ts
import { defineStore } from '@free-walk/svelte-store'

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

### Setup Style

```ts
import { defineStore, writable, derived } from '@free-walk/svelte-store'

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

### Usage in Components

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

## Store Instance API

| Method / Property | Description |
|-------------------|-------------|
| `$id` | Store's unique identifier string |
| `$state` | Get current state snapshot |
| `$patch(partial)` | Batch update state (object or function) |
| `$reset()` | Reset state to initial value (Options API only) |
| `$subscribe(callback)` | Listen for state changes, returns unsubscribe function |
| `subscribe(run)` | Standard svelte/store subscription interface |

### $patch Usage

```ts
// Object style
counter.$patch({ count: 10 })

// Function style
counter.$patch((state) => {
  state.count++
  state.name = 'Updated'
})
```

### $subscribe Usage

```ts
const unsubscribe = counter.$subscribe((state) => {
  console.log('State changed:', state)
})

// Unsubscribe when needed
unsubscribe()
```

## Plugin System

```ts
import { addPlugin } from '@free-walk/svelte-store'

// Persistence plugin example
addPlugin(({ store, storeId }) => {
  const key = `svelte-store-${storeId}`
  const saved = localStorage.getItem(key)
  if (saved) {
    try {
      store.$patch(JSON.parse(saved))
    } catch {}
  }

  store.$subscribe((state) => {
    localStorage.setItem(key, JSON.stringify(state))
  })
})

// Logging plugin example
addPlugin(({ store, storeId }) => {
  store.$subscribe((state) => {
    console.log(`[${storeId}]`, state)
  })
})
```

## Helper Functions

### mapState

Extract state properties as individual Readable stores:

```ts
import { mapState } from '@free-walk/svelte-store'

const { count, name } = mapState(useCounterStore, ['count', 'name'])
// count and name are Readable<number> and Readable<string>
```

### mapActions

Extract actions as standalone functions:

```ts
import { mapActions } from '@free-walk/svelte-store'

const { increment, decrement } = mapActions(useCounterStore, ['increment', 'decrement'])
increment() // Call directly
```

## Compatibility

| Format | File | Usage |
|--------|------|-------|
| ESM | `dist/svelte-store.mjs` | `import` syntax |
| CJS | `dist/svelte-store.cjs` | `require()` syntax |
| Svelte Source | `src/index.ts` | Direct Svelte project import |

## License

MIT
