import { useEffect, useState } from 'react';
import { fetchSmsPromotions, type SmsPromotion } from '../../api';
import { Badge, Btn, Card, EmptyState, ErrorMsg, TableCard, TD, TH, statColor } from '../../components/SharedUI';

/*
 * SMS audit, 2026-09-24: blasts were a second bulk system beside
 * Campaigns, with its own five presets and its own daily cap that could
 * not see what campaigns sent. Sending now happens under Campaigns, which
 * has the audience builder, A/B, scheduling, a test to yourself and one
 * shared daily cap. This tab keeps the history of the old blasts.
 */
export function PromotionsTab({ onGoToCampaigns }: { onGoToCampaigns?: () => void } = {}) {
  const [history, setHistory] = useState<SmsPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetchSmsPromotions();
        const data = Array.isArray(res.promotions) ? res.promotions : res.promotions?.data ?? [];
        setHistory(data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      {error && <ErrorMsg message={error} />}
      <Card style={{ marginBottom: 20 }} data-testid="blasts-moved">
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>SMS blasts now go out as campaigns</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Build the audience from what customers bought, preview it, send a test to yourself, then send now or at a set time.
          One daily recipient cap covers every campaign and past blast. Below is the history of blasts sent from here.
        </p>
        {onGoToCampaigns && <Btn onClick={onGoToCampaigns}>Go to Campaigns</Btn>}
      </Card>

      <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Past blasts</h4>
      {loading ? (
        <Card><EmptyState message="Loading history…" /></Card>
      ) : history.length === 0 ? (
        <Card><EmptyState message="No blasts were sent from here." /></Card>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Name / Message</th>
                <th style={TH}>Status</th>
                <th style={TH}>Recipients</th>
                <th style={TH}>Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-light)' }} data-testid={`blast-${p.id}`}>
                  <td style={TD}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{p.name ?? '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.message}</div>
                  </td>
                  <td style={TD}><Badge label={p.status ?? '—'} color={statColor(p.status ?? 'default')} /></td>
                  <td style={TD}><span style={{ fontSize: 13 }}>{(p.recipients_count ?? p.recipient_count ?? 0).toLocaleString()}</span></td>
                  <td style={TD}><span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{new Date(p.created_at).toLocaleDateString()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  );
}
