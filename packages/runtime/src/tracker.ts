
type Subscriber = (id: string) => void;

class Tracker {
  private isPaused = false;
  // 現在解析中のタスク（購読者）のスタック
  private stack: Subscriber[] = [];

  /**
   * 関数を実行し、その中でアクセスされたIDをすべて収集する
   */
  track<T>(fn: () => T, onCollect: Subscriber): T {
    this.stack.push(onCollect);
    try {
      return fn();
    } finally {
      this.stack.pop();
    }
  }

  silence<T>(fn: () => T): T {
    const prev = this.isPaused;
    this.isPaused = true;
    try {
      return fn();
    } finally {
      this.isPaused = prev;
    }
  }

  report(id: string) {
    if (this.isPaused) return;
    const currentSubscriber = this.stack[this.stack.length - 1];
    if (currentSubscriber) {
      currentSubscriber(id);
    }
  }
}

export const quixTracker = new Tracker();
