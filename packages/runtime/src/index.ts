import { logger } from './logger'
import { nanoid } from 'nanoid'
import { quixTracker } from './tracker'
import type { Instruction, VNode } from './h'
type Simplify<T> = { [K in keyof T]: T[K] } & {}
type ToSignal<T> = {
	[K in keyof T]: (update?: T[K]) => T[K]
}
type ToReader<T> = {
	[K in keyof T]: () => T[K]
}
type StateBankEntry<V> = {
	id: string
	value: V
	isDerived: false
}
type DerivedBankEntry<V, TState, TDerived> = {
	id: string
	value: (state: ToReader<TState & TDerived>) => V
	isDerived: true
}
type HandlerSignals<TState, TDerived> = ToSignal<TState> & ToReader<TDerived>;
type HandlerFn<TState, TDerived> = (signals: HandlerSignals<TState, TDerived>) => void;


class Component<
	TState extends Record<string, any> = {},
	TDerived extends Record<string, any> = {},
	TProps = {},
	THandlers = {},
> {
	name: string
	private stateBank: Simplify<
		{
			[P in keyof TState]: StateBankEntry<TState[P]>
		} & {
			[P in keyof TDerived]: DerivedBankEntry<TDerived[P], TState, TDerived>
		}
	> = {} as any
	private handlerBank: Record<string, HandlerFn<TState,TDerived>> = {};

	private createReaderProxy(): ToReader<TState & TDerived> {
	//基本的に型チェックで防いでくれる前提。
		return new Proxy<ToReader<TState & TDerived>>({} as any, {
			get: (_, key) => {
				const k = key as keyof (TState & TDerived)
				const entry = (this.stateBank as any)[k] as
					| StateBankEntry<any>
					| DerivedBankEntry<any, TState, TDerived>
				if (!entry) return undefined
		  return () => {
        // 💡 呼び出されたこと自体を常に報告する
        quixTracker.report(entry.id);

        if (entry.isDerived) {
          // 💡 重要：Derivedの中身を実行する間は、
          // 内部での report（依存の吸い上げ）を一時的に停止させる
          return quixTracker.silence(() => {
            return entry.value(this.createReaderProxy());
          });
        }
        return entry.value;
      };
			},
		}) as ToReader<TState & TDerived>
	}
	private createSignalProxy(): HandlerSignals<TState, TDerived> {
  return new Proxy({} as any, {
    get: (_, key: string) => {
      // 厳密な stateBank からエントリーを取得
      const entry = (this.stateBank as any)[key] as
        | StateBankEntry<any>
        | DerivedBankEntry<any, TState, TDerived>;

      if (!entry) return undefined;

      // 1. State エントリーの場合 (isDerived: false)
      if (!entry.isDerived) {
        return (update?: any) => {
          if (update !== undefined) {
            // Setter: 値を更新（解析時はログのみ）
            logger.debug(`Handler-Set | State[${entry.id}] -> ${update}`);
            return update;
          }
          // Getter: 生の値を返す
          return entry.value;
        };
      }

      // 2. Derived エントリーの場合 (isDerived: true)
      // 読み取り専用なので、常に計算関数(value)を実行して返す
      return () => {
        logger.debug(`Handler-Get | Derived[${entry.id}] read`);
        // 依存関係を連鎖させるために ReaderProxy を渡して実行
        return entry.value(this.createReaderProxy());
      };
    },
  }) as any;
}
	constructor(name: string) {
		this.name = name
		logger.info(`Component | ${name}`)
	}

	state<K extends string, V>(
		key: K,
		value: V
	): Component<TState & Record<K, V>, TDerived, TProps, THandlers> {
		// 内部バンクへの保存（型安全に代入）
		;(this.stateBank as any)[key] = {
			id: nanoid(),
			value: value,
			isDerived: false,
		}

		logger.info(`State | ${key} : ${typeof value}`)
		return this as any
	}
	derived<K extends string, V>(
  key: K,
  fn: (state: ToReader<TState & TDerived>) => V
): Component<TState, TDerived & Record<K, V>, TProps, THandlers> {
  const id = nanoid();
  const deps = new Set<string>();

  quixTracker.track(
    () => fn(this.createReaderProxy()), // 実行中にProxyがIDをreportする
    (depId) => deps.add(depId)          // 報告されたIDをdepsに溜める
  );

  (this.stateBank as any)[key] = {
    id,
    value: fn, // あなたの型定義に合わせて value という名で関数を保持
    isDerived: true,
  } as DerivedBankEntry<V, TState, TDerived>;

  logger.info(`Derived | ${key} [${id}] (depends on: ${Array.from(deps).join(', ')})`);
  return this as any;
}

handler<K extends string>(
  key: K,
  fn: HandlerFn<TState,TDerived>
): Component<TState, TDerived, TProps, THandlers & Record<K, HandlerFn<TState,TDerived>>> {

  // ハンドラを登録
  this.handlerBank[key] = fn;

  logger.info(`Handler | ${key} registered`);

  // 型を合成して次へ繋ぐ
  return this as any;
}
render(
  fn: (args: {
    state: ToReader<TState & TDerived>;
    handlers: THandlers;
  }) => VNode // h関数の戻り値を受け取る
) {
  logger.info(`Render  | Analyzing structure: ${this.name}`);
  const handlerProxy = new Proxy({} as any, {
    get: (_, key: string) => `{{HANDLER:${key}}}`
  });
  // 1. 解析の実行（Proxyを渡して render 関数を叩く）
  const rootVNode = fn({
    state: this.createReaderProxy(),
    handlers: handlerProxy as THandlers
  });

  // 2. 最終的な「設計図（Manifest）」の作成
  // stateBankにあるIDと、rootVNodeに集まった全パスを紐付ける
  const manifest = {
    name: this.name,
    html: rootVNode.html,
    updateMap: {} as Record<string, Instruction[]>
  };

  rootVNode.instructions.forEach(inst => {
    if (!manifest.updateMap[inst.signalId]) {
      manifest.updateMap[inst.signalId] = [];
    }
    manifest.updateMap[inst.signalId]?.push(inst);
  });

  logger.success(`Render  | Found ${rootVNode.instructions.length} dynamic bindings`);
  // Component.render の最後
  rootVNode.instructions.forEach((inst, i) => {
    logger.info(`Binding ${i}: ${inst.signalId} at path [${inst.path}] (${inst.action})`);
  });
  logger.info(`Manifest | ${JSON.stringify(manifest,)}`);
  // これが「親が受け取るコンパイル済み情報」
  return manifest;
}
}

export function component(name: string) {
	return new Component(name)
}
