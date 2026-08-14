import { req } from './client';

export type DeployStampInfo = {
  commit: string;
  commit_short: string;
  branch: string;
  deployed_at: string;
};

export interface SystemHealthDetailed {
  status: 'ok' | 'degraded';
  deploy?: DeployStampInfo;
  failed_jobs_24h: number;
  webhook_failures_24h: number;
  payment_pending_stuck: number;
  sms_failed_24h: number;
  print_proxy_ok: boolean | null;
  print_proxy_status: 'ok' | 'unreachable' | 'not_configured' | string;
  queue_depth: number;
  redis?: {
    status: 'up' | 'down' | 'degraded' | string;
    ok: boolean;
    latency_ms: number | null;
    error: string | null;
  };
  disk?: {
    ok: boolean | null;
    free_percent: number | null;
    free_gb: number | null;
    path: string;
  };
  checked_at: string;
  recent_failed_jobs: Array<{
    id: number;
    uuid: string;
    connection: string;
    queue: string;
    exception_snippet?: string;
    failed_at: string;
  }>;
  recent_webhook_failures: Array<{
    id: number;
    idempotency_key: string;
    event_type: string | null;
    error_message: string | null;
    created_at: string | null;
  }>;
  stuck_payment_pending_orders: Array<{
    id: number;
    order_number: string;
    total: number;
    created_at: string | null;
  }>;
  scheduler_last_runs?: Array<{
    command: string;
    last_run: string | null;
    stale: boolean;
  }>;
  alert_inbox?: Array<{
    type: string;
    severity: 'warning' | 'critical' | string;
    count: number;
    message: string;
    link: string | null;
  }>;
}

export async function getSystemHealthDetailed(): Promise<SystemHealthDetailed> {
  return req('/admin/system/health/detailed');
}

export async function retryFailedJob(uuid: string): Promise<{ message: string }> {
  return req(`/admin/system/health/failed-jobs/${encodeURIComponent(uuid)}/retry`, { method: 'POST' });
}

export async function forgetFailedJob(uuid: string): Promise<{ message: string }> {
  return req(`/admin/system/health/failed-jobs/${encodeURIComponent(uuid)}`, { method: 'DELETE' });
}

export type CloneLiveToTestStatus = {
  available: boolean;
  reason?: string;
  running?: boolean;
  status?: {
    state: string;
    started_at: string | null;
    finished_at: string | null;
    exit_code: number | null;
    message: string | null;
  };
  log_tail?: string;
};

export async function getCloneLiveToTestStatus(): Promise<CloneLiveToTestStatus> {
  return req('/admin/ops/clone-live-to-test');
}

export async function startCloneLiveToTest(): Promise<{ message: string }> {
  return req('/admin/ops/clone-live-to-test', {
    method: 'POST',
    body: JSON.stringify({ confirm: 'CLONE FROM LIVE' }),
  });
}
