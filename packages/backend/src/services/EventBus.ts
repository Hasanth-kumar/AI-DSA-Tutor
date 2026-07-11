import { EventEmitter } from "node:events";

export type DataChangeType =
  | "session"
  | "problem"
  | "topic"
  | "sync"
  | "note"
  | "attempt"
  /** Re-solve pool/queue changed (§9) — Today + Re-solve surfaces refetch. */
  | "resolve";

export interface DataChangeEvent {
  type: DataChangeType;
  at: string;
}

/** In-process pub/sub backing the SSE stream (5.4). */
export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  publish(type: DataChangeType): void {
    const event: DataChangeEvent = { type, at: new Date().toISOString() };
    this.emitter.emit("change", event);
  }

  subscribe(listener: (event: DataChangeEvent) => void): () => void {
    this.emitter.on("change", listener);
    return () => this.emitter.off("change", listener);
  }
}
