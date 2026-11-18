/**
 * A tiny async mutex.
 *
 * Node's event loop already prevents *data races* on a plain `Map`, but the
 * assignment explicitly requires the order store to be protected by a mutex,
 * and A2 will replace this store with PostgreSQL transactions where real
 * concurrency matters. The mutex serialises all store mutations so the
 * semantics (and the code) stay identical between A1 and A2.
 */
export class Mutex {
  private locked = false;
  private readonly waiters: Array<() => void> = [];

  get isLocked(): boolean {
    return this.locked;
  }

  /** Acquires the lock, waits if it is currently held. */
  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return this.createRelease();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return this.createRelease();
  }

  /** Runs `fn` while holding the lock. */
  async runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) {
        // Ownership transfers directly to the next waiter.
        next();
      } else {
        this.locked = false;
      }
    };
  }
}
