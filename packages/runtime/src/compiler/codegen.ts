export function generateAppJs(component: any) {
  const { name, bank, handlerBank, instructions } = component
  const safeId = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '_')

  // --- 1. 名前生成器 (a, b, c...z, aa, ab...) ---
  const getShortName = (index: number): string => {
    let res = ''
    let n = index
    while (n >= 0) {
      res = String.fromCharCode(97 + (n % 26)) + res
      n = Math.floor(n / 26) - 1
    }
    return `_${res}` // 競合防止のためアンダースコアを付与
  }

  // --- 2. マッピングの作成 ---
  const entries = Object.values(bank) as any[]
  const idToShort = new Map<string, string>()

  // 状態/Derived/テンプレートに短い名前を割り振る
  entries.forEach((e, i) => {
    idToShort.set(e.id, getShortName(i))
  })

  // セレクタ（DOM参照）に短い名前を割り振る
  const allSelectors = Array.from(
    new Set(instructions.map((i: any) => i.selector))
  )
  const selToShort = new Map<string, string>()
  allSelectors.forEach((sel, i) => {
    selToShort.set(sel as string, `_e${getShortName(i)}`)
  })

  const getInfo = (id: string) => {
    const entry = entries.find(e => e.id === id)
    const short = idToShort.get(id) || safeId(id)
    const isDerived = entry?.isDerived ?? false
    return {
      name: short,
      isDerived,
      ref: isDerived ? `${short}()` : short, // _a() か _a か
    }
  }

  // --- 3. 置換ロジック (s.count() -> _a 等) ---
  const replaceScope = (code: string) => {
    let result = code
    // Getter: s.name() -> _a() or _a
    Object.keys(bank).forEach(key => {
      const info = getInfo(bank[key].id)
      const getterRegex = new RegExp(
        `s(?:\\.${key}|\\[["']${key}["']\\])\\(\\s*\\)`,
        'g'
      )
      result = result.replace(getterRegex, info.ref)
    })
    // Setter: s.name(val) -> (_a = val, _u_a())
    Object.keys(bank).forEach(key => {
      const info = getInfo(bank[key].id)
      if (!info.isDerived) {
        const setterRegex = new RegExp(
          `s(?:\\.${key}|\\[["']${key}["']\\])\\((.+)\\)`,
          'g'
        )
        result = result.replace(
          setterRegex,
          `(${info.name} = $1, _u${info.name}())`
        )
      }
    })
    return result
  }

  // --- 4. 依存マップ ---
  const dependentsMap: Record<string, string[]> = {}
  entries.forEach(e => {
    e.deps?.forEach((dId: string) => {
      ;(dependentsMap[dId] || (dependentsMap[dId] = [])).push(e.id)
    })
  })

  // --- 5. コードパーツの生成 ---

  // State宣言
  const stateDecls = entries
    .filter(e => !e.isDerived)
    .map(e => `  let ${idToShort.get(e.id)} = ${JSON.stringify(e.value)};`)
    .join('\n')

  // Derived/Template宣言
  const derivedDecls = entries
    .filter(e => e.isDerived)
    .map(e => {
      const short = idToShort.get(e.id)!
      let body = ''
      if (e.templateBody) {
        body = `\`${e.templateBody.replace(/\$\{s\["([\w-]+)"\]\(\)\}/g, (_, key) => `\${${getInfo(bank[key].id).ref}}`)}\``
      } else {
        const rawFn = e.value
          .toString()
          .replace(/^\s*\(?\s*[a-zA-Z_$][\w$]*\s*\)?\s*=>\s*/, '')
        body = replaceScope(rawFn)
      }
      return `  const ${short} = () => ${body};`
    })
    .join('\n')

  // DOMキャッシュ
  const domCache = allSelectors
    .map(
      sel =>
        `  const ${selToShort.get(sel as string)} = root.querySelector('${sel}');`
    )
    .join('\n')

  // 更新関数 (up)
  const updateFns = entries
    .map(e => {
      const short = idToShort.get(e.id)!
      const domOps = instructions
        .filter(
          (inst: any) => inst.signalId === e.id && inst.action === 'setText'
        )
        .map(
          (i: any) =>
            `    if(${selToShort.get(i.selector)}) ${selToShort.get(i.selector)}.textContent = ${getInfo(e.id).ref};`
        )
        .join('\n')
      const cascade = (dependentsMap[e.id] || [])
        .map(dId => `    _u${idToShort.get(dId)}();`)
        .join('\n')
      return domOps || cascade
        ? `  function _u${short}() {\n${domOps}\n${cascade}\n  }`
        : ''
    })
    .filter(Boolean)
    .join('\n')

  // イベント登録
  const eventListeners = instructions
    .filter((inst: any) => inst.action === 'addListener')
    .map((inst: any) => {
      const handlerFn = handlerBank[inst.signalId]
      if (!handlerFn) return ''
      const rawFn = handlerFn
        .toString()
        .replace(/^\s*\(?\s*[a-zA-Z_$][\w$]*\s*\)?\s*=>\s*/, '')
      const body = replaceScope(rawFn)
      return `  if(${selToShort.get(inst.selector)}) ${selToShort.get(inst.selector)}.addEventListener('${inst.attrName}', () => { ${body} });`
    })
    .join('\n')

  return `
// --- Quix Minified Zero Runtime [${name}] ---
(function() {
  const root = document.getElementById("app");
  if (!root) return;
${domCache}
${stateDecls}
${derivedDecls}
${updateFns}
${eventListeners}
})();`.trim()
}
