type DepCollector = (id: string) => void

interface Scope {
  id: string
  collector: DepCollector
}

class Tracker {
  private stack: Scope[] = []
  private isPaused = false

  /**
   * 依存関係の収集を開始します
   * @param id スコープのID（要素のIDなど）
   * @param collector 依存IDを受け取るコールバック
   */
  runWithScope<T>(id: string, collector: DepCollector, fn: () => T): T {
    this.stack.push({ id, collector })
    try {
      return fn()
    } finally {
      this.stack.pop()
    }
  }

  /**
   * 現在のスコープに対して依存を報告します
   * (ステートの getter から呼ばれる)
   */
  report(id: string) {
    if (this.isPaused) return
    const current = this.stack[this.stack.length - 1]
    if (current) {
      current.collector(id)
    }
  }

  /**
   * 追跡を一時的に無効化して関数を実行します
   * (Derivedの計算中などに使用)
   */
  silence<T>(fn: () => T): T {
    const prev = this.isPaused
    this.isPaused = true
    try {
      return fn()
    } finally {
      this.isPaused = prev
    }
  }
}

// シングルトンとしてエクスポート
export const tracker = new Tracker()
