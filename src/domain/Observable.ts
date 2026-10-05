export type Listener<T> = (value: T) => void;

/**
 * Tiny publish/subscribe helper. Classes that change over time expose one
 * of these so the interface can react without the domain knowing about it.
 */
export class Observable<T> {
  private readonly listeners = new Set<Listener<T>>();

  /** Registers a listener and returns a function that removes it. */
  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }
}
