import type { AssemblyRequest, WorkerOut } from './types';

export interface AssembleOptions {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Run a PDF assembly in a fresh dedicated worker. A new worker per export keeps
 * state clean and lets us hard-terminate on cancel. Source bytes are passed by
 * structured clone (NOT transferred) so the caller's originals stay usable.
 */
export function assemblePdf(
  req: AssemblyRequest,
  opts: AssembleOptions = {},
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workers/pdf-worker.ts', import.meta.url), {
      type: 'module',
    });

    const cleanup = () => {
      worker.terminate();
      opts.signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Export cancelled', 'AbortError'));
    };
    if (opts.signal) {
      if (opts.signal.aborted) {
        worker.terminate();
        reject(new DOMException('Export cancelled', 'AbortError'));
        return;
      }
      opts.signal.addEventListener('abort', onAbort);
    }

    worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const msg = ev.data;
      if (msg.type === 'progress') {
        opts.onProgress?.(msg.done, msg.total);
      } else if (msg.type === 'done') {
        cleanup();
        resolve(msg.bytes);
      } else if (msg.type === 'error') {
        cleanup();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (ev) => {
      cleanup();
      reject(new Error(ev.message || 'Assembly worker crashed.'));
    };

    worker.postMessage({ type: 'assemble', req });
  });
}
