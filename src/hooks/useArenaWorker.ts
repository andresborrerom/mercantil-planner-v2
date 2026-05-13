/**
 * useArenaWorker — hook que envuelve el Arena Web Worker.
 *
 * Equivalente a useBootstrapWorker pero para el orquestador end-to-end
 * (runBootstrap + buildArenaMarket + runArena). Crea UN worker por mount,
 * lo reutiliza entre corridas, lo termina al unmount.
 *
 * Uso:
 *   const worker = useArenaWorker();
 *   const result = await worker.run(input);
 *   // result.aumPath, result.sleevePath, result.stats, ...
 */
import { useCallback, useEffect, useRef } from 'react';
import type { ArenaJobInput, ArenaJobOutput } from '../workers/arena.worker';

type OkResponse = {
  id: string;
  ok: true;
  result: ArenaJobOutput;
};

type ErrResponse = {
  id: string;
  ok: false;
  error: string;
};

type ProgressResponse = {
  id: string;
  progress: true;
  stage: 'bootstrap' | 'arena';
  completedPaths?: number;
  totalPaths?: number;
};

type WorkerResponse = OkResponse | ErrResponse | ProgressResponse;

type PendingJob = {
  resolve: (value: ArenaJobOutput) => void;
  reject: (reason: Error) => void;
};

export function useArenaWorker(): {
  run: (input: ArenaJobInput) => Promise<ArenaJobOutput>;
} {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, PendingJob>>(new Map());
  const counterRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/arena.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      const pending = pendingRef.current.get(msg.id);
      if (!pending) return;
      if ('progress' in msg) {
        // Worker no emite progress por ahora — placeholder para futuro.
        return;
      }
      pendingRef.current.delete(msg.id);
      if (msg.ok === true) {
        pending.resolve(msg.result);
      } else {
        pending.reject(new Error(msg.error));
      }
    };

    worker.onerror = (event) => {
      const err = new Error(event.message || 'Error inesperado en arena.worker');
      for (const [, p] of pendingRef.current) p.reject(err);
      pendingRef.current.clear();
    };

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRef.current.clear();
    };
  }, []);

  const run = useCallback((input: ArenaJobInput): Promise<ArenaJobOutput> => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.reject(new Error('arena.worker no inicializado'));
    }
    const id = `arena-job-${++counterRef.current}`;
    return new Promise<ArenaJobOutput>((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      worker.postMessage({ id, payload: input });
    });
  }, []);

  return { run };
}
