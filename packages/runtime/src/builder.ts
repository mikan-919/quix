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
    return new Proxy<ToReader<TState & TDerived>>({} as any, {
        get: (_, key) => {
            const k = key as keyof (TState & TDerived)
            const entry = (this.stateBank as any)[k] as
                | StateBankEntry<any>
                | DerivedBankEntry<any, TState, TDerived>
            if (!entry) return undefined

            return () => {
                // 💡 呼ばれたことを報告（スタックの頂上の h スコープに届く）
                quixTracker.report(entry.id);

                if (entry.isDerived) {
                    // 💡 Derived の内部実行は silence し、依存の重複を防ぐ
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
      const entry = (this.stateBank as any)[key] as
        | StateBankEntry<any>
        | DerivedBankEntry<any, TState, TDerived>;

      if (!entry) return undefined;

      if (!entry.isDerived) {
        return (update?: any) => {
          if (update !== undefined) {
            logger.debug(`Handler-Set | State[${entry.id}] -> ${update}`);
            return update;
          }
          return entry.value;
        };
      }
      return () => {
        logger.debug(`Handler-Get | Derived[${entry.id}] read`);
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
    () => fn(this.createReaderProxy()),
    (depId) => deps.add(depId)
  );

  (this.stateBank as any)[key] = {
    id,
    value: fn,
    isDerived: true,
  } as DerivedBankEntry<V, TState, TDerived>;

  logger.info(`Derived | ${key} [${id}] (depends on: ${Array.from(deps).join(', ')})`);
  return this as any;
}

handler<K extends string>(
  key: K,
  fn: HandlerFn<TState,TDerived>
): Component<TState, TDerived, TProps, THandlers & Record<K, HandlerFn<TState,TDerived>>> {

  this.handlerBank[key] = fn;
  logger.info(`Handler | ${key} registered`);
  return this as any;
}
render(
  fn: (args: {
    state: ToReader<TState & TDerived>;
    handlers: THandlers;
  }) => VNode
) {
  logger.info(`Render  | Analyzing structure: ${this.name}`);
  const handlerProxy = new Proxy({} as any, {
    get: (_, key: string) => `{{HANDLER:${key}}}`
  });
  const rootVNode = fn({
    state: this.createReaderProxy(),
    handlers: handlerProxy as THandlers
  });

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
  rootVNode.instructions.forEach((inst, i) => {
    logger.info(`Binding ${i}: ${inst.signalId} at path [${inst.path}] (${inst.action})`);
  });
  logger.info(`Manifest | ${JSON.stringify(manifest, (key, value) => {
      return typeof value === 'function' ? value.toString() : value;
    })}`);
  return manifest;
}
}

export function component(name: string) {
	return new Component(name)
}
