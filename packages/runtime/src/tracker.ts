type Subscriber = (id: string) => void
type QuixScope = { id: string; onReport: Subscriber }

class Tracker {
  // スコープ（h関数やtrack呼び出し）を管理するスタック
  private stack: QuixScope[] = []
  // Derivedの計算中などに報告を無視するためのフラグ
  private isPaused = false

  /**
   * 指定した関数を実行し、その中で report された全ての ID を収集します。
   * derived の初期化などで使用します。
   */
  track<T>(fn: () => T, onCollect: Subscriber): T {
    // 仮想的なルートスコープを積む
    this.stack.push({ id: 'track-root', onReport: onCollect })
    try {
      return fn()
    } finally {
      this.stack.pop()
    }
  }

  /**
   * h関数の開始時に呼び出し、その要素の依存回収スコープを作成します。
   */
  beginScope(id: string, onReport: Subscriber) {
    this.stack.push({ id, onReport })
  }

  /**
   * h関数の終了時に呼び出し、スコープを閉じます。
   */
  endScope() {
    this.stack.pop()
  }

  /**
   * 実行中の report を一時的に無効化します。
   * Derived の内部で State が呼ばれたときに、内部依存を隠蔽するために使用します。
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

  /**
   * シグナル（State/Derived）が呼ばれたときに、現在のスコープに ID を報告します。
   */
  report(id: string) {
    if (this.isPaused) return
    const current = this.stack[this.stack.length - 1]
    if (current) {
      current.onReport(id)
    }
  }
}
export const quixTracker = new Tracker()
