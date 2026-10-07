import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Bot, CheckCircle2, Copy, Link2, RefreshCw, Send, Trash2, Unlink, AlertTriangle, Users } from 'lucide-react';
import { ApiRequestError } from '@shared/api';
import {
  fetchTelegram, addTelegramBot, updateTelegramBot, checkTelegramBot, reconnectTelegramBot,
  removeTelegramBot, makeTelegramLink, testTelegramLink, unlinkTelegram, updateTelegramSettings,
  updateTelegramGroup, testTelegramGroup, removeTelegramGroup,
  type TelegramBot, type TelegramGroup, type TelegramOverview, type TelegramPerson, type TelegramRole,
} from '../api/telegram';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, ConfirmDialog, ErrorMsg, Input, Modal, ModalActions, PageHeader, PageShell, Spinner, useConfirmDialog,
} from '../components/SharedUI';
import { Toggle } from '../components/ui';
import { useToast } from '../components/ui';

/*
 * Admin → Telegram (owner, 2026-10-06: "Build owner bot now. Then manager,
 * then staff"). One bot can serve every role, or each role its own bot.
 * Each person links their own Telegram once with a one-time link; alerts
 * and the bot's buttons then reach them there. docs/TELEGRAM_BOTS.md.
 */

const ROLE_ORDER: TelegramRole[] = ['owner', 'manager', 'staff', 'kitchen_staff', 'driver'];

/** What each level can do today; later steps fill in the rest. */
const ROLE_NOTE: Record<TelegramRole, string> = {
  owner: 'Alerts, Today, Week, Cashiers, Shifts, Open orders, Approvals, Sold out, Shop, Refunds owed, Complaints, Customer, day report',
  manager: 'Alerts and the buttons their permissions allow; the day report with Reports access',
  staff: 'Alerts, and Start / Ready on order cards in a shop group (cashier menu later)',
  kitchen_staff: 'Alerts, and Start / Ready on order cards in a shop group (kitchen menu later)',
  driver: 'A message for each delivery given to them; My deliveries with Picked up, On the way, Delivered',
};

function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiRequestError) {
    const body = e.body as { message?: string } | undefined;
    return body?.message || e.message || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function TelegramPage() {
  usePageTitle('Telegram');
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const [data, setData] = useState<TelegramOverview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [linkFor, setLinkFor] = useState<TelegramPerson | null>(null);
  const [roleFilter, setRoleFilter] = useState<TelegramRole | 'all'>('all');

  const load = () => {
    fetchTelegram()
      .then((d) => { setData(d); setLoadError(''); })
      .catch((e) => setLoadError(errorText(e, 'Could not load Telegram settings.')));
  };
  useEffect(load, []);

  const roleLabel = (r: string) => data?.roles.find((x) => x.key === r)?.label ?? r;

  const people = useMemo(() => {
    const list = data?.people ?? [];
    const sorted = [...list].sort((a, b) => ROLE_ORDER.indexOf(a.role as TelegramRole) - ROLE_ORDER.indexOf(b.role as TelegramRole) || a.name.localeCompare(b.name));
    return roleFilter === 'all' ? sorted : sorted.filter((p) => p.role === roleFilter);
  }, [data, roleFilter]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast('success', ok);
      load();
    } catch (e) {
      toast('error', errorText(e, 'That did not work.'));
    } finally {
      setBusy(null);
    }
  };

  if (loadError) {
    return <PageShell><PageHeader title="Telegram" section="System" /><ErrorMsg message={loadError} /></PageShell>;
  }
  if (!data) {
    return <PageShell><PageHeader title="Telegram" section="System" /><div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner /></div></PageShell>;
  }

  const linkedCount = data.people.filter((p) => p.links.length > 0).length;

  return (
    <PageShell>
      <PageHeader
        title="Telegram"
        section="System"
        subtitle="Staff alerts, a bot with buttons for sales, shifts and approvals, online orders in a shop group, and deliveries for drivers."
      />

      <div className="tg-grid">
        <div className="tg-col">
          <BotsCard data={data} busy={busy} run={run} roleLabel={roleLabel} onAsk={confirm.ask} />
          <GroupsCard data={data} busy={busy} run={run} onAsk={confirm.ask} />
          <SettingsCard data={data} busy={busy} run={run} />
        </div>

        <Card>
          <div className="tg-card-head">
            <div>
              <h2 className="tg-h2">People</h2>
              <p className="tg-muted">{linkedCount} of {data.people.length} linked. Each person opens their own link once, on their own phone.</p>
            </div>
          </div>
          <div className="tg-chips" role="group" aria-label="Filter by role">
            {(['all', ...ROLE_ORDER] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={`tg-chip${roleFilter === r ? ' tg-chip--on' : ''}`}
                aria-pressed={roleFilter === r}
                onClick={() => setRoleFilter(r)}
              >
                {r === 'all' ? 'Everyone' : roleLabel(r)}
              </button>
            ))}
          </div>

          {people.length === 0 ? (
            <p className="tg-muted" style={{ padding: '16px 0' }}>Nobody with this role.</p>
          ) : (
            <ul className="tg-people">
              {people.map((p) => {
                const link = p.links[0];
                const bot = link ? data.bots.find((b) => b.id === link.bot_id) : undefined;
                const servingBots = data.bots.filter((b) => b.is_enabled && b.roles.includes(p.role as TelegramRole));
                return (
                  <li key={`${p.kind}-${p.id}`} className="tg-person">
                    <div className="tg-person__main">
                      <span className="tg-person__name">{p.name}</span>
                      <span className="tg-muted">{p.role_label}{p.phone ? ` · ${p.phone}` : ''}</span>
                      {link ? (
                        <span className="tg-person__status">
                          {link.blocked
                            ? <Badge color="red">Blocked the bot</Badge>
                            : <Badge color="green">Linked</Badge>}
                          <span className="tg-muted">
                            {link.telegram_username ? `@${link.telegram_username}` : link.telegram_name}
                            {bot && data.bots.length > 1 ? ` · ${bot.name}` : ''}
                            {link.last_seen_at ? ` · last used ${when(link.last_seen_at)}` : ''}
                          </span>
                        </span>
                      ) : (
                        <span className="tg-person__status"><Badge color="gray">Not linked</Badge></span>
                      )}
                    </div>
                    <div className="tg-person__actions">
                      {link ? (
                        <>
                          <Btn small variant="secondary" disabled={busy !== null} onClick={() => run(`test-${link.id}`, () => testTelegramLink(link.id), `Test sent to ${p.name}.`)}>
                            <Send size={14} /> Test
                          </Btn>
                          <Btn small variant="ghost" disabled={busy !== null} onClick={() => confirm.ask({
                            title: 'Unlink?',
                            message: `${p.name} will get no more alerts on Telegram.`,
                            confirmLabel: 'Unlink',
                            danger: true,
                            onConfirm: () => run(`unlink-${link.id}`, () => unlinkTelegram(link.id), 'Unlinked.'),
                          })}>
                            <Unlink size={14} /> Unlink
                          </Btn>
                        </>
                      ) : (
                        <Btn small variant="secondary" disabled={servingBots.length === 0} title={servingBots.length === 0 ? 'No bot serves this role yet' : undefined} onClick={() => setLinkFor(p)}>
                          <Link2 size={14} /> Link
                        </Btn>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {linkFor && <LinkModal person={linkFor} bots={data.bots.filter((b) => b.is_enabled && b.roles.includes(linkFor.role as TelegramRole))} onClose={() => { setLinkFor(null); load(); }} />}
      <ConfirmDialog state={confirm.state} close={confirm.close} />
    </PageShell>
  );
}

// ── Bots ──────────────────────────────────────────────────────────────────────

function BotsCard({ data, busy, run, roleLabel, onAsk }: {
  data: TelegramOverview;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  roleLabel: (r: string) => string;
  onAsk: ReturnType<typeof useConfirmDialog>['ask'];
}) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(data.bots.length === 0);

  const check = async (bot: TelegramBot) => {
    try {
      const res = await checkTelegramBot(bot.id);
      toast(res.ok ? 'success' : 'warning', res.message);
    } catch (e) {
      toast('error', errorText(e, 'Could not check the bot.'));
    }
    await run('reload', async () => undefined);
  };

  return (
    <Card>
      <div className="tg-card-head">
        <div>
          <h2 className="tg-h2">Bots</h2>
          <p className="tg-muted">One bot can serve everyone; tick the roles it serves. TEST and the live site each need their own bot.</p>
        </div>
        {!adding && <Btn small onClick={() => setAdding(true)}><Bot size={14} /> Add a bot</Btn>}
      </div>

      {data.bots.map((bot) => (
        <div key={bot.id} className="tg-bot">
          <div className="tg-bot__top">
            <div>
              <div className="tg-bot__name">{bot.name}</div>
              <div className="tg-muted">{bot.username ? `@${bot.username}` : 'Not checked yet'} · {bot.linked_count} linked</div>
            </div>
            <Toggle
              checked={bot.is_enabled}
              disabled={busy !== null}
              label={bot.is_enabled ? 'On' : 'Off'}
              onChange={(on) => run(`toggle-${bot.id}`, () => updateTelegramBot(bot.id, { is_enabled: on }), on ? 'Bot on.' : 'Bot off. It will not answer or send alerts.')}
            />
          </div>

          <div className="tg-roles">
            {ROLE_ORDER.map((r) => {
              const on = bot.roles.includes(r);
              return (
                <label key={r} className={`tg-role${on ? ' tg-role--on' : ''}`} title={ROLE_NOTE[r]}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busy !== null || (on && bot.roles.length === 1)}
                    onChange={() => {
                      const roles = on ? bot.roles.filter((x) => x !== r) : [...bot.roles, r];
                      void run(`roles-${bot.id}`, () => updateTelegramBot(bot.id, { roles }), 'Saved.');
                    }}
                  />
                  {roleLabel(r)}
                </label>
              );
            })}
          </div>

          {bot.last_error ? (
            <div className="tg-warn"><AlertTriangle size={14} /> {bot.last_error}</div>
          ) : bot.last_checked_at ? (
            <div className="tg-ok"><CheckCircle2 size={14} /> Working · checked {when(bot.last_checked_at)}</div>
          ) : null}

          <div className="tg-bot__actions">
            <Btn small variant="secondary" disabled={busy !== null} onClick={() => void check(bot)}><RefreshCw size={14} /> Check</Btn>
            {bot.last_error && (
              <Btn small variant="secondary" disabled={busy !== null} onClick={() => run(`reconnect-${bot.id}`, () => reconnectTelegramBot(bot.id), 'Reconnected to this site.')}>Reconnect</Btn>
            )}
            <Btn small variant="ghost" disabled={busy !== null} onClick={() => onAsk({
              title: 'Remove this bot?',
              message: `${bot.name} stops working here and everyone linked to it is unlinked. The bot itself stays in your Telegram account.`,
              confirmLabel: 'Remove',
              danger: true,
              onConfirm: () => run(`remove-${bot.id}`, () => removeTelegramBot(bot.id), 'Bot removed.'),
            })}><Trash2 size={14} /> Remove</Btn>
          </div>
        </div>
      ))}

      {adding && <AddBotForm onDone={() => { setAdding(false); void run('reload', async () => undefined); }} onCancel={data.bots.length > 0 ? () => setAdding(false) : undefined} roleLabel={roleLabel} />}
    </Card>
  );
}

function AddBotForm({ onDone, onCancel, roleLabel }: { onDone: () => void; onCancel?: () => void; roleLabel: (r: string) => string }) {
  const { toast } = useToast();
  const [name, setName] = useState('Bake & Grill Staff');
  const [token, setToken] = useState('');
  const [roles, setRoles] = useState<TelegramRole[]>([...ROLE_ORDER]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [takeOver, setTakeOver] = useState<string | null>(null);

  const save = async (force = false) => {
    setSaving(true);
    setError('');
    try {
      await addTelegramBot({ name: name.trim(), token: token.trim(), roles, take_over: force || undefined });
      toast('success', 'Bot added and connected.');
      onDone();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        setTakeOver(errorText(e, ''));
      } else {
        setError(errorText(e, 'Could not add the bot.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tg-add">
      <ol className="tg-steps">
        <li>In Telegram, open <b>@BotFather</b>, send <code>/newbot</code>, and choose a name and a username ending in “bot”.</li>
        <li>BotFather replies with a token (numbers, a colon, then letters). Copy it and paste it below.</li>
      </ol>
      <Input label="Name (only you see this)" value={name} onChange={setName} maxLength={80} />
      <Input label="Bot token" value={token} onChange={setToken} type="password" autoComplete="off" placeholder="123456789:AA…" />
      <div>
        <div className="tg-label">Serves</div>
        <div className="tg-roles">
          {ROLE_ORDER.map((r) => (
            <label key={r} className={`tg-role${roles.includes(r) ? ' tg-role--on' : ''}`}>
              <input type="checkbox" checked={roles.includes(r)} onChange={() => setRoles((cur) => cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r])} />
              {roleLabel(r)}
            </label>
          ))}
        </div>
      </div>
      {error && <ErrorMsg message={error} />}
      {takeOver && (
        <div className="tg-warn tg-warn--block">
          <AlertTriangle size={16} />
          <div>
            <p style={{ margin: 0 }}>{takeOver}</p>
            <Btn small variant="secondary" style={{ marginTop: 8 }} disabled={saving} onClick={() => void save(true)}>Move it here</Btn>
          </div>
        </div>
      )}
      <div className="tg-bot__actions">
        <Btn disabled={saving || token.trim() === '' || name.trim() === '' || roles.length === 0} onClick={() => void save()}>
          {saving ? 'Connecting…' : 'Add and connect'}
        </Btn>
        {onCancel && <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>}
      </div>
    </div>
  );
}

// ── Groups ────────────────────────────────────────────────────────────────────

export function GroupsCard({ data, busy, run, onAsk }: {
  data: TelegramOverview;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  onAsk: ReturnType<typeof useConfirmDialog>['ask'];
}) {
  const groups: TelegramGroup[] = data.groups ?? [];
  const bot = data.bots.find((b) => b.is_enabled && b.username) ?? null;
  const command = `/feed${bot?.username ? `@${bot.username}` : ''}`;

  return (
    <Card>
      <div className="tg-card-head">
        <div>
          <h2 className="tg-h2">Groups</h2>
          <p className="tg-muted">Online orders posted in a shop group, each with Start and Ready (and Collected for a pickup). The card says who pressed what, and follows the order when it moves on at the till or with the driver.</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <ol className="tg-steps" data-testid="tg-groups-empty">
          <li>In Telegram, make a group for the shop (or use the one you have) and add <b>{bot?.username ? `@${bot.username}` : 'the bot'}</b> to it.</li>
          <li>From your own linked Telegram, send <code>{command}</code> in that group.</li>
          <li>It appears here. Staff who press the buttons need their own Telegram linked and the right to update orders.</li>
        </ol>
      ) : groups.map((g) => (
        <div key={g.id} className="tg-bot" data-testid={`tg-group-${g.id}`}>
          <div className="tg-bot__top">
            <div>
              <div className="tg-bot__name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Users size={15} aria-hidden />{g.title}</div>
              <div className="tg-muted">
                Online orders{g.bot ? ` · ${g.bot.name}` : ''}{g.added_by ? ` · added by ${g.added_by}` : ''}
                {g.last_posted_at ? ` · last order ${when(g.last_posted_at)}` : ''}
              </div>
            </div>
            <Toggle
              checked={g.is_enabled}
              disabled={busy !== null}
              label={g.is_enabled ? 'On' : 'Off'}
              onChange={(on) => run(`group-${g.id}`, () => updateTelegramGroup(g.id, { is_enabled: on }), on ? 'Orders will be posted there again.' : 'Paused. No orders go to that group.')}
            />
          </div>
          {g.last_error && <div className="tg-warn"><AlertTriangle size={14} /> {g.last_error}</div>}
          <div className="tg-bot__actions">
            <Btn small variant="secondary" disabled={busy !== null || !g.is_enabled} onClick={() => run(`group-test-${g.id}`, () => testTelegramGroup(g.id), 'Test sent to the group.')}><Send size={14} /> Send a test</Btn>
            <Btn small variant="ghost" disabled={busy !== null} onClick={() => onAsk({
              title: 'Remove this group?',
              message: `No more orders go to ${g.title}, and the bot leaves the group. Send ${command} there again to bring it back.`,
              confirmLabel: 'Remove',
              danger: true,
              onConfirm: () => run(`group-remove-${g.id}`, () => removeTelegramGroup(g.id), 'Group removed.'),
            })}><Trash2 size={14} /> Remove</Btn>
          </div>
        </div>
      ))}
    </Card>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function SettingsCard({ data, busy, run }: {
  data: TelegramOverview;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>;
}) {
  const s = data.settings;
  return (
    <Card>
      <h2 className="tg-h2">Alerts</h2>
      <div className="tg-setting">
        <div>
          <div className="tg-setting__title">Staff and owner alerts on Telegram</div>
          <p className="tg-muted">Every “Staff” and “Owner” alert in the SMS Control Center, and discount approval codes, also go to the person's Telegram when they are linked.</p>
        </div>
        <Toggle checked={s.alerts_enabled} disabled={busy !== null} onChange={(on) => run('s-alerts', () => updateTelegramSettings({ alerts_enabled: on }), 'Saved.')} />
      </div>
      <div className="tg-setting">
        <div>
          <div className="tg-setting__title">Who gets alerts by Telegram, SMS or email</div>
          <p className="tg-muted">Set per role and per person in <Link to="/sms?tab=control-center#channels">SMS Control Center → Who gets alerts, and how</Link>. Someone on Telegram only gets no SMS; if Telegram cannot reach them, the SMS is sent, so nothing is missed.</p>
        </div>
      </div>
      <div className="tg-setting">
        <div>
          <div className="tg-setting__title">Day report when the last shift closes</div>
          <p className="tg-muted">Sales, payments, best sellers, each shift's drawer and refunds still owed, sent once a day to linked owners and to linked managers who can see reports.</p>
        </div>
        <Toggle checked={s.day_report} disabled={busy !== null} onChange={(on) => run('s-day', () => updateTelegramSettings({ day_report: on }), 'Saved.')} />
      </div>
    </Card>
  );
}

// ── Link modal ────────────────────────────────────────────────────────────────

function LinkModal({ person, bots, onClose }: { person: TelegramPerson; bots: TelegramBot[]; onClose: () => void }) {
  const { toast } = useToast();
  const [botId, setBotId] = useState<number | null>(bots.length === 1 ? bots[0].id : null);
  const [link, setLink] = useState<{ url: string; minutes: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (botId === null) return;
    setLink(null);
    setError('');
    makeTelegramLink({ bot_id: botId, ...(person.kind === 'driver' ? { driver_id: person.id } : { user_id: person.id }) })
      .then((r) => r.url ? setLink({ url: r.url, minutes: r.minutes }) : setError('Press Check on the bot first.'))
      .catch((e) => setError(errorText(e, 'Could not make a link.')));
  }, [botId, person]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast('success', 'Link copied. Send it to them privately.');
    } catch {
      toast('error', 'Copy did not work; select the link and copy it.');
    }
  };

  return (
    <Modal title={`Link ${person.name}`} onClose={onClose} maxWidth={460}>
      {bots.length > 1 && (
        <div className="tg-roles" style={{ marginBottom: 12 }}>
          {bots.map((b) => (
            <button key={b.id} type="button" className={`tg-chip${botId === b.id ? ' tg-chip--on' : ''}`} onClick={() => setBotId(b.id)}>{b.name}</button>
          ))}
        </div>
      )}
      {error && <ErrorMsg message={error} />}
      {botId !== null && !link && !error && <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}><Spinner /></div>}
      {link && (
        <div className="tg-link">
          <p className="tg-muted" style={{ margin: 0 }}>On <b>{person.name}</b>'s phone: scan this with the camera, or open the link, then press <b>Start</b> in Telegram.</p>
          <div className="tg-qr"><QRCodeSVG value={link.url} size={200} marginSize={1} /></div>
          <div className="tg-url">
            <code>{link.url}</code>
            <Btn small variant="secondary" onClick={() => void copy()}><Copy size={14} /> Copy</Btn>
          </div>
          <p className="tg-muted" style={{ margin: 0 }}>Works once, for {link.minutes} minutes, and only for {person.name}. Do not post it in a group.</p>
        </div>
      )}
      <ModalActions>
        <Btn variant="secondary" onClick={onClose}>Done</Btn>
      </ModalActions>
    </Modal>
  );
}

export default TelegramPage;
