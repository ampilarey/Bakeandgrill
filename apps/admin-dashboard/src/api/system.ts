import { req } from './client';

export interface SystemHealthDetailed {
  status: 'ok' | 'degraded';
  failed_jobs_24h: number;
  webhook_failures_24h: number;
  payment_pending_stuck: number;
  sms_failed_24h: number;
  print_proxy_ok: boolean | null;
  print_proxy_status: 'ok' | 'unreachable' | 'not_configured' | string;
  queue_depth: number;
  checked_at: string;
  recent_failed_jobs: Array<{
    id: number;
    uuid: string;
    connection: string;
    queue: string;
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
}

export async function getSystemHealthDetailed(): Promise<SystemHealthDetailed> {
  return req('/admin/system/health/detailed');
}
