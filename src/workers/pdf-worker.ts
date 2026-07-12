/// <reference lib="webworker" />
import { assembleCore } from '../assemble-core';
import type { WorkerIn, WorkerOut } from '../types';

function post(msg: WorkerOut, transfer?: Transferable[]) {
  (self as unknown as Worker).postMessage(msg, transfer ?? []);
}

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const data = ev.data;
  if (data?.type !== 'assemble') return;
  try {
    const bytes = await assembleCore(data.req, (done, total) =>
      post({ type: 'progress', done, total }),
    );
    post({ type: 'done', bytes }, [bytes.buffer]);
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : 'Failed to assemble PDF.',
    });
  }
};
