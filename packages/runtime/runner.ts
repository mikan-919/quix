import { spawn, build } from 'bun'
import { watch } from 'fs'

const ENTRYPOINT = './src/demo.ts'

let child: ReturnType<typeof spawn> | null = null
let restarting = false
let watchers: (() => void)[] = []

async function getDeps(entry: string) {
  const result = await build({
    entrypoints: [entry],
    format: 'esm',
    external: ['consola', 'nanoid'],
    sourcemap: 'external',
  })

  const files = new Set<string>()

  for (const out of result.outputs) {
    const sm = out.sourcemap
    if (!sm) continue

    const map = JSON.parse(await sm.text())
    for (const src of map.sources) {
      if (!src.startsWith('node:') && !src.includes('node_modules')) {
        files.add(src.replace('file://', ''))
      }
    }
  }

  return [...files]
}

function clearWatchers() {
  for (const close of watchers) close()
  watchers = []
}

function start() {
  if (child) child.kill()

  console.clear()
  console.log('▶ running...')

  child = spawn(['bun', 'run', ENTRYPOINT], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })

  child.exited.then(code => {
    if (!restarting) {
      console.log(`\n✖ crashed (code=${code}) waiting for save...`)
    }
  })
}

async function setupWatch() {
  clearWatchers()
  const deps = await getDeps(ENTRYPOINT)

  for (const file of deps) {
    const w = watch(file, () => {
      if (restarting) return
      restarting = true
      setTimeout(async () => {
        restarting = false
        await setupWatch() // 依存変化にも追従
        start()
      }, 100)
    })
    watchers.push(() => w.close())
  }
}

await setupWatch()
start()
