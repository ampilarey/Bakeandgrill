import net from 'net';

/**
 * Printer reachability for /health.
 *
 * The backend polls the proxy's /health from the admin System Health page and
 * the scheduler heartbeat. A proxy that answers "ok" while the kitchen printer
 * is unplugged used to look healthy; now each whitelisted printer gets a TCP
 * connect probe and the response lists the ones that did not answer. Results
 * are cached for a short window so frequent polling never turns into a stream
 * of connections to the printers, and concurrent callers share one probe.
 *
 * Only names leave this module — never hosts or ports.
 */
export interface PrinterTarget {
  name: string;
  host: string;
  port: number;
}

export interface PrinterStatus {
  name: string;
  reachable: boolean;
}

export type Prober = (host: string, port: number, timeoutMs: number) => Promise<boolean>;

export const tcpProbe: Prober = (host, port, timeoutMs) =>
  new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
    socket.connect(port, host);
  });

export interface PrinterMonitorOptions {
  probe?: Prober;
  /** How long a probe result is reused before printers are contacted again. */
  cacheMs?: number;
  /** Per-printer connect timeout. */
  timeoutMs?: number;
  now?: () => number;
}

export interface PrinterMonitor {
  statuses(): Promise<PrinterStatus[]>;
}

export function createPrinterMonitor(
  printers: PrinterTarget[],
  options: PrinterMonitorOptions = {},
): PrinterMonitor {
  const probe = options.probe ?? tcpProbe;
  const cacheMs = options.cacheMs ?? 30_000;
  const timeoutMs = options.timeoutMs ?? 1_500;
  const now = options.now ?? (() => Date.now());

  let cached: { at: number; statuses: PrinterStatus[] } | null = null;
  let inflight: Promise<PrinterStatus[]> | null = null;

  return {
    async statuses() {
      const at = now();
      if (cached && at - cached.at < cacheMs) return cached.statuses;
      if (inflight) return inflight;

      inflight = Promise.all(
        printers.map(async (p) => ({
          name: p.name,
          reachable: await probe(p.host, p.port, timeoutMs).catch(() => false),
        })),
      )
        .then((statuses) => {
          cached = { at, statuses };
          return statuses;
        })
        .finally(() => {
          inflight = null;
        });

      return inflight;
    },
  };
}

export function offlineNames(statuses: PrinterStatus[]): string[] {
  return statuses.filter((s) => !s.reachable).map((s) => s.name);
}
