// packages/runtime/src/h.ts
import { quixTracker } from "./tracker";

export type Instruction = {
  signalId: string;
  selector: string;
  path: number[];
  action: "setText" | "setAttr"|"addListener";
  attrName?: string;
};
export type VNode = {
  tag: string;
  html: string;
  instructions: Instruction[];
};



let qidCounter = 0;
const generateQid = () => `q-${qidCounter++}`;

export function h(tag: string, props: any, ...children: any[]): VNode {
  const instructions: Instruction[] = [];
  const processedChildrenHtml: string[] = [];
  const qid = generateQid();
  let needsQid = false;
  const filteredProps: Record<string, string> = {};

  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (typeof v === "string" && v.startsWith("{{HANDLER:")) {
        needsQid = true;
        const handlerName = v.replace("{{HANDLER:", "").replace("}}", "");

        // 💡 命令（Instruction）には記録するが、HTMLには含めない
        instructions.push({
          signalId: handlerName,
          selector: `.${qid}`,
          path: [],
          action: "addListener", // アクション名を明確にする
          attrName: k.toLowerCase().replace("on", "") // onClick -> click
        });
        // filteredProps には追加しないことで、HTMLから消える
      } else {
        filteredProps[k] = String(v);
      }
    }

  }

  // 1. 子要素の解析
  children.flat().forEach((child, index) => {
    if (typeof child === "function") {
      needsQid = true; // 関数（動的）を含んでいるので自分を特定可能にする
      const deps = new Set<string>();
      const initialValue = quixTracker.track(() => child(), id => deps.add(id));

      deps.forEach(signalId => {
        instructions.push({
          signalId,
          selector: `.${qid}`,
          path: [index],       // その要素から見た相対位置
          action: "setText"
        });
      });
      processedChildrenHtml.push(String(initialValue));

    } else if (typeof child === "object" && child !== null && "instructions" in child) {
      const childVNode = child as VNode;
      // 子の命令を吸い上げるが、子は既に自分の qid を持っているので
      // パスを深くせず、そのままの命令を保持させる（セレクタが既に固有のため）
      instructions.push(...childVNode.instructions);
      processedChildrenHtml.push(childVNode.html);
    } else {
      processedChildrenHtml.push(String(child));
    }
  });



  // 3. 必要ならクラスを付与（これが唯一の目印になる）
  if (needsQid) {
    const existingClass = filteredProps["class"] || "";
    filteredProps["class"] = `${existingClass} ${qid}`.trim();
  }

  const attrString = Object.entries(filteredProps)
    .map(([k, v]) => `${k}="${v}"`).join(" ");

  return {
    tag,
    html: `<${tag}${attrString ? " " + attrString : ""}>${processedChildrenHtml.join("")}</${tag}>`,
    instructions
  };
}
