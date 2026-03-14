import { useEffect, useState } from 'react';
import {
  fetchWebhooks, createWebhook, updateWebhook, deleteWebhook,
  rotateWebhookSecret, fetchWebhookLogs, fetchSupportedWebhookEvents,
  type WebhookSubscription, type WebhookLog,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, Input, PageHeader, Spinner,
} from '../components/Layout';

function StatusBadge({ status }: { status: string }) {
  if (status === 'delivered') return <Badge label="delivered" color="green" />;
  return <Badge label="failed" color="red" />;
}

function WebhookForm({
  initial,
  allEvents,
  onSave,
  onCancel,
}: {
  initial?: Partial<WebhookSubscription>;
  allEvents: string[];
  onSave: (data: { name: string; url: string; events: string[] }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [events, setEvents] = useState<string[]>(initial?.events ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = (e: string) =>
    setEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);

  const handleSave = async () => {
    if (!name.trim() || !url.trim() || events.length === 0) {
      setError('Name, URL and at least one event are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), url: url.trim(), events });
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Name</p>
        <Input value={name} onChange={setName} placeholder="My Integration" />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Endpoint URL</p>
        <Input value={url} onChange={setUrl} placeholder="https://…" />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Events</p>
        <div style={{
          border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px',
          maxHeight: 220, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px',
        }}>
          {allEvents.map((ev) => (
            <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
              <input type="checkbox" checked={events.includes(ev)} onChange={() => toggle(ev)} />
              <span style={{ fontFamily: 'monospace' }}>{ev}</span>
            </label>
          ))}
        </div>
      </div>
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
        <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

function LogsDrawer({
  subscription,
  onClose,
}: {
  subscription: WebhookSubscription;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWebhookLogs(subscription.id)
      .then((r) => setLogs(r.data ?? []))
      .finally(() => setLoading(false));
  }, [subscription.id]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      zIndex: 40, display: 'flex', justifyContent: 'flex-end',
    }}>
      <div style={{
        background: '#fff', width: '100%', maxWidth: 480,
        height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
        }}>
          <h2 style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>
            Logs — {subscription.name}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}
          >
            &times;
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? <Spinner /> : logs.length === 0 ? (
            <EmptyState message="No delivery attempts yet." />
          ) : logs.map((log) => (
            <div key={log.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusBadge status={log.status} />
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{log.event}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>{log.response_code ?? '—'}</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                {new Date(log.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WebhooksPage() {
    usePageTitle('Webhooks');
  const [subs, setSubs] = useState<WebhookSubscription[]>([]);
  const [allEvents, setAllEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WebhookSubscription | null>(null);
  const [logsFor, setLogsFor] = useState<WebhookSubscription | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    Promise.all([fetchWebhooks(), fetchSupportedWebhookEvents()])
      .then(([ws, evs]) => {
        setSubs(ws.subscriptions);
        setAllEvents(evs.events);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (data: { name: string; url: string; events: string[] }) => {
    await createWebhook(data);
    setShowForm(false);
    load();
  };

  const handleUpdate = async (data: { name: string; url: string; events: string[] }) => {
    if (!editing) return;
    await updateWebhook(editing.id, data);
    setEditing(null);
    load();
  };

  const handleToggleActive = async (sub: WebhookSubscription) => {
    await updateWebhook(sub.id, { active: !sub.active });
    load();
  };

  const handleDelete = async (sub: WebhookSubscription) => {
    if (!confirm(`Delete webhook "${sub.name}"?`)) return;
    await deleteWebhook(sub.id);
    load();
  };

  const handleRotate = async (sub: WebhookSubscription) => {
    const r = await rotateWebhookSecret(sub.id);
    alert(`New secret for "${sub.name}":\n\n${r.secret}\n\nSave it now — it won't be shown again.`);
    load();
  };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Outgoing Webhooks"
        subtitle="Push real-time events to external systems via signed HTTP POST"
        action={!showForm && !editing ? (
          <Btn onClick={() => setShowForm(true)}>+ Add Webhook</Btn>
        ) : undefined}
      />

      {error && <ErrorMsg message={error} />}

      {showForm && (
        <Card>
          <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>New Webhook</h3>
          <WebhookForm allEvents={allEvents} onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </Card>
      )}

      {editing && (
        <Card>
          <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Edit — {editing.name}</h3>
          <WebhookForm
            initial={editing}
            allEvents={allEvents}
            onSave={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        </Card>
      )}

      {loading ? (
        <Spinner />
      ) : subs.length === 0 ? (
        <EmptyState message="No webhook subscriptions yet. Add one above." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {subs.map((sub) => (
            <Card key={sub.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{sub.name}</span>
                    <Badge
                      label={sub.disabled_at ? 'auto-disabled' : sub.active ? 'active' : 'paused'}
                      color={sub.active && !sub.disabled_at ? 'green' : 'red'}
                    />
                    {sub.failure_count > 0 && (
                      <Badge label={`${sub.failure_count} failures`} color="yellow" />
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sub.url}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {sub.events.map((ev) => (
                      <span key={ev} style={{
                        background: '#f1f5f9', color: '#64748b', fontSize: 10,
                        borderRadius: 4, padding: '2px 6px', fontFamily: 'monospace',
                      }}>
                        {ev}
                      </span>
                    ))}
                  </div>
                  {sub.last_triggered_at && (
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                      Last triggered: {new Date(sub.last_triggered_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  <Btn variant="secondary" small onClick={() => setEditing(sub)}>Edit</Btn>
                  <Btn variant="secondary" small onClick={() => setLogsFor(sub)}>Logs</Btn>
                  <Btn variant="secondary" small onClick={() => handleToggleActive(sub)}>
                    {sub.active ? 'Pause' : 'Enable'}
                  </Btn>
                  <Btn variant="secondary" small onClick={() => handleRotate(sub)}>Rotate Secret</Btn>
                  <Btn variant="danger" small onClick={() => handleDelete(sub)}>Delete</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {logsFor && (
        <LogsDrawer subscription={logsFor} onClose={() => setLogsFor(null)} />
      )}
    </div>
  );
}
