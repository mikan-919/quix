type BankEntry = {
  id: string
  value: any
  deps?: string[]
  isDerived: boolean
}

export function generateAppJs(component: any) {
  const { name, bank, handlers, html, instructions } = component

  // IDをJS変数名として安全にする
  const safeId = (id: string) => id.replace(/[-]/g, '_')

  // 1. 各ノードの依存関係（逆引き）を計算：誰が変わったら誰が影響を受けるか
  const dependentsMap: Record<string, string[]> = {}
  Object.values(bank).forEach((entry: any) => {
    if (entry.deps) {
      entry.deps.forEach((depId: string) => {
        if (!dependentsMap[depId]) dependentsMap[depId] = []
        dependentsMap[depId].push(entry.id)
      })
    }
  })

  // 2. State変数 (v_...)
  const stateDecls = Object.values(bank)
    .filter((e: any) => !e.isDerived)
    .map((e: any) => `  let v_${safeId(e.id)} = ${JSON.stringify(e.value)};`)
    .join('\n')

  // 3. Derived関数 (f_...)
  const derivedDecls = Object.values(bank)
    .filter((e: any) => e.isDerived)
    .map((e: any) => {
      const sId = safeId(e.id)
      // 関数に渡す「scope」オブジェクト。s.count() などの呼び出しを解決
      const scopeObj = Object.keys(bank)
        .map(key => {
          const target = bank[key]
          const valCall =
            target.id === e.id
              ? `() => { throw 'Recursive' }`
              : `() => ${target.isDerived ? `f_${safeId(target.id)}()` : `v_${safeId(target.id)}`}`
          return `"${key}": ${valCall}`
        })
        .join(', ')

      return `  const f_${sId} = () => (${e.value.toString()})({ ${scopeObj} });`
    })
    .join('\n')

  // 4. 更新関数 (up_...)：DOM操作と依存Derivedの起爆をセットにする
  const updateFns = Object.values(bank)
    .map((e: any) => {
      const sId = safeId(e.id)

      // このノードに紐づくDOM操作（setTextなど）
      const domOps = instructions
        .filter(
          (inst: any) => inst.signalId === e.id && inst.action === 'setText'
        )
        .map(
          (inst: any) =>
            `    { const el = root.querySelector('${inst.selector}'); if(el) el.textContent = ${e.isDerived ? `f_${sId}()` : `v_${sId}`}; }`
        )
        .join('\n')

      // このノードに依存している他のノード（Derived）の更新関数を叩く
      const cascade = (dependentsMap[e.id] || [])
        .map(depId => `    up_${safeId(depId)}();`)
        .join('\n')

      return `  function up_${sId}() {\n${domOps}\n${cascade}\n  }`
    })
    .join('\n')

  // 5. イベントリスナーとハンドラ
  const eventListeners = instructions
    .filter((inst: any) => inst.action === 'addListener')
    .map((inst: any) => {
      // signalsプロキシの構築：値を代入してup関数を起爆
      const signalsSetter = Object.keys(bank)
        .map(key => {
          const e = bank[key]
          const sId = safeId(e.id)
          return `"${key}": (val) => { if(val !== undefined){ v_${sId} = val; up_${sId}(); } return ${e.isDerived ? `f_${sId}()` : `v_${sId}`}; }`
        })
        .join(', ')

      return `
    root.querySelector('${inst.selector}').addEventListener('${inst.attrName}', (e) => {
      const s = { ${signalsSetter} };
      (${component.handlerBank[inst.signalId].toString()})(s);
    });`
    })
    .join('\n')

  // 最終出力
  return `
// --- Quix Zero Runtime Output [${name}] ---
(function() {
  const root = document.getElementById("app");
  if (!root) return;

  // 1. States
${stateDecls}

  // 2. Deriveds
${derivedDecls}

  // 3. Update Functions (Reactive Chain)
${updateFns}

  // 4. Mount & Event Listeners
  const mount = () => {
${eventListeners}
  };

  mount();
})();
  `.trim()
}
