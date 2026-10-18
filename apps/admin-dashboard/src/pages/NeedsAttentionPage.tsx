import { PageHeader, PageShell, Card } from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';
import { useInbox } from '../hooks/useInbox';
import { InboxList } from '../components/InboxList';

/*
 * Needs attention (iruali import plan, feature 14): one list of what wants a
 * person today, across refunds, complaints, reviews, questions, messages, the
 * bank, the kitchen and the system. Each row is a page you can open; the list
 * refreshes every minute.
 */
export default function NeedsAttentionPage() {
  usePageTitle('Needs attention');
  const { rows, loaded } = useInbox();
  return (
    <PageShell>
      <PageHeader section="System" title="Needs attention" />
      <Card>
        {loaded ? <InboxList rows={rows} /> : <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>Loading…</p>}
      </Card>
    </PageShell>
  );
}
