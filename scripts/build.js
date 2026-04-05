/**
 * svelte-store 构建脚本
 * 输出 ESM (.mjs) / CJS (.cjs)
 */
import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const ENTRY = path.join(ROOT, 'src', 'index.ts')

// 清空 dist 目录
if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true })
}
fs.mkdirSync(DIST, { recursive: true })

const commonOptions = {
    entryPoints: [ENTRY],
    bundle: true,
    external: ['svelte', 'svelte/*'],
    minify: true,
    target: 'esnext',
    logLevel: 'info',
}

console.log('🔨 开始构建 svelte-store...\n')

// 1. ESM 格式
console.log('📦 构建 ESM (.mjs)...')
await esbuild.build({
    ...commonOptions,
    format: 'esm',
    outfile: path.join(DIST, 'svelte-store.mjs'),
})

// 2. CJS 格式
console.log('📦 构建 CJS (.cjs)...')
await esbuild.build({
    ...commonOptions,
    format: 'cjs',
    outfile: path.join(DIST, 'svelte-store.cjs'),
})

// 输出构建结果
console.log('\n✅ 构建完成！输出目录: dist/')
const files = fs.readdirSync(DIST).filter(f => !fs.statSync(path.join(DIST, f)).isDirectory())
for (const file of files) {
    const size = fs.statSync(path.join(DIST, file)).size
    const sizeKB = (size / 1024).toFixed(1)
    console.log(`  ${file} — ${sizeKB} KB`)
}
