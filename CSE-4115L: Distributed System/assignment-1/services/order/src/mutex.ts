export class Mutex {
  private locked = false;
  private readonly waiters: Array<() => void> = [];

  get isLocked(): boolean {
    return this.locked;
  }

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return this.createRelease();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return this.createRelease();
  }

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
        next();
      } else {
        this.locked = false;
      }
    };
  }
}
