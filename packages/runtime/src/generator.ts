// packages/compiler/src/generator.ts
import { nanoid } from "nanoid";
import { Instruction, Manifest } from "@quix/runtime";

export function generateQuixOutput(manifest: Manifest): string {
  const { name, html, updateMap, stateBank } = manifest;

  // 1. 各命令（パス）に対して、一意のマーカー（クラス名）を割り当てる
  const markerMap: Record<string, string> = {}; // key: "id:path", value: "q-xxxxx"

  // 更新用JSのコード断片
  const targetDeclarations: string[] = [];
  const updateLogic: Record<string, string[]> = {};

  // マニフェストをスキャンしてマーカーとJSを準備
  for (const [signalId, instructions] of Object.entries(updateMap)) {
    updateLogic[signalId] = updateLogic[signalId] || [];

    instructions.forEach((inst, i) => {
      const markerId = `q-${nanoid(6)}`;
      const key = `${inst.signalId}:${inst.path.join(",")}`;
      markerMap[key] = markerId;

      // ブラウザ側でDOMを保持する変数名
      const varName = `el_${markerId.replace("-", "_")}`;
      targetDeclarations.push(`const ${varName} = document.querySelector(".${markerId}");`);

      // 更新時の処理（とりあえずsetText）
      updateLogic[signalId].push(`${varName}.textContent = val;`);
    });
  }

  // 2. HTMLにクラスを注入する（※実際にはh関数で付与するのが理想ですが、ここではデモ用にパスから逆算）
  // シンプルにするため、ここでは「h関数が既にクラスを振ってくれたHTML」をシミュレート、
  // または簡易的な置換ロジックを想定します。
  let finalHtml = html;
  // ※本来は JSDOM 等で path を辿って class を add する処理が入ります。

  // 3. 依存関係（Derived）の解決ロジックを生成
  // count が変わったら double の計算も走らせるようなコード
  const reactiveEffectJS = Object.values(stateBank)
    .filter(entry => entry.isDerived)
    .map(entry => {
      const depIds = Array.from(entry.dependencies || []);
      // 依存しているものが更新されたら、自分の更新JSも叩く
      return depIds.map(depId => `
        if (key === "${depId}") {
          const computed = (${entry.fn.toString()})(proxy);
          update("${entry.id}", computed);
        }
      `).join("");
    }).join("");

  // 4. 最終的なテンプレート文字列
  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Quix App - ${name}</title>
  <style>
    .quix-root { font-family: sans-serif; padding: 2rem; }
  </style>
</head>
<body>
  <div id="app" class="quix-root">
    ${finalHtml}
  </div>

  <script type="module">
    // --- Quix Runtime (Inline) ---
    const updateMap = ${JSON.stringify(updateLogic, null, 2)};
    ${targetDeclarations.join("\n    ")}

    const state = ${JSON.stringify(
      Object.fromEntries(Object.entries(stateBank).filter(([_, e]) => !e.isDerived).map(([k, e]) => [e.id, e.value]))
    )};

    function update(key, val) {
      // 1. DOMの直接更新
      if (updateMap[key]) {
        updateMap[key].forEach(fnStr => {
          // 実際には eval は使わず、関数として保持する
          const fn = new Function("val", "el", fnStr);
          // ※ここは最適化の余地あり
        });
        // デモ用：単純な代入に変換されている想定
        ${Object.entries(updateLogic).map(([id, codes]) => `
          if (key === "${id}") {
            ${codes.join("\n            ")}
          }
        `).join("")}
      }

      // 2. 依存関係（Derived）の連鎖更新
      ${reactiveEffectJS}
    }

    // デモ用：windowにセットしてコンソールから叩けるようにする
    window.quixSet = (id, val) => {
      state[id] = val;
      update(id, val);
    };

    console.log("Quix initialized. Try: quixSet('${Object.keys(state)[0]}', 100)");
  </script>
</body>
</html>
  `;
}
