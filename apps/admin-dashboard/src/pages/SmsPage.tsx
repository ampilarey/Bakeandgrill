import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Zap, Users, FileText, Clock } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader, PageShell, TabScrollRow } from '../components/SharedUI';
import { CampaignsTab } from './SmsPage/CampaignsTab';
import { PromotionsTab } from './SmsPage/PromotionsTab';
import { ContactsTab } from './SmsPage/ContactsTab';
import { TemplatesTab } from './SmsPage/TemplatesTab';
import { ScheduledTab } from './SmsPage/ScheduledTab';

/*
 * SMS campaigns: texts somebody sends on purpose (campaigns, blasts,
 * scheduled messages) and the contacts and templates they use.
 *
 * Notifications audit, 2026-10-10: the automatic messages left. The
 * Control Center, Recipients, Automations and Audit Logs tabs are System →
 * Notifications now (Messages, People, Log); their old links land there.
 */

type Tab = 'campaigns' | 'promotions' | 'contacts' | 'templates' | 'scheduled';

const VALID_TABS: Tab[] = ['campaigns', 'promotions', 'contacts', 'templates', 'scheduled'];

/** Old ?tab= values and where they live now. */
const MOVED: Record<string, string> = {
  'control-center': '/notifications/messages',
  automations: '/notifications/messages',
  recipients: '/notifications/people',
  logs: '/notifications/log',
};

type SmsTabDef = { id: Tab; label: string; icon?: React.ReactNode };

const SMS_SECTIONS: { id: string; label: string; tabs: SmsTabDef[] }[] = [
  {
    id: 'marketing',
    label: 'Marketing',
    tabs: [
      { id: 'campaigns', label: 'Campaigns' },
      { id: 'promotions', label: 'Past blasts', icon: <Zap size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> },
      { id: 'contacts', label: 'Contacts & Groups', icon: <Users size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> },
      { id: 'scheduled', label: 'Scheduled', icon: <Clock size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> },
    ],
  },
  {
    id: 'library',
    label: 'Library',
    tabs: [
      { id: 'templates', label: 'Templates', icon: <FileText size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> },
    ],
  },
];

function sectionForTab(t: Tab) {
  return SMS_SECTIONS.find((s) => s.tabs.some((tab) => tab.id === t)) ?? SMS_SECTIONS[0];
}

const S = {
  sectionTab: (active: boolean): React.CSSProperties => ({
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
    marginBottom: -2,
    whiteSpace: 'nowrap',
  }),
  sectionBar: {
    marginBottom: 0,
    borderBottom: '2px solid var(--color-border)',
  },
  subTabBar: {
    marginBottom: 20,
    marginTop: 12,
  },
  // Icon and word on one line: an svg is a block, so it sat above the word (50px tabs).
  tab: (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 12px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: active ? 700 : 400,
    background: active ? 'var(--color-primary)' : 'transparent',
    color: active ? 'var(--color-on-primary)' : 'var(--color-text-secondary)',
    transition: 'all .15s',
    whiteSpace: 'nowrap',
  }),
};

export function SmsPage() {
  usePageTitle('SMS campaigns');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const initialTab: Tab = tabFromUrl && VALID_TABS.includes(tabFromUrl as Tab)
    ? (tabFromUrl as Tab)
    : 'campaigns';
  const [tab, setTab] = useState<Tab>(initialTab);
  const currentSection = sectionForTab(tab);

  const campaignPrefill = useMemo(() => ({
    create: searchParams.get('create') === '1',
    segment: searchParams.get('segment') || '',
    message: searchParams.get('message') || '',
  }), [searchParams]);

  const moved = tabFromUrl ? MOVED[tabFromUrl] : undefined;
  if (moved) {
    const campaignId = searchParams.get('campaign_id');
    return <Navigate to={`${moved}${tabFromUrl === 'logs' && campaignId ? `?campaign_id=${encodeURIComponent(campaignId)}` : ''}`} replace />;
  }

  const selectTab = (next: Tab) => {
    setTab(next);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', next);
    if (next !== 'campaigns') {
      nextParams.delete('create');
      nextParams.delete('segment');
      nextParams.delete('message');
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <PageShell>
      <PageHeader
        section="Customers & Marketing"
        title="SMS campaigns"
        subtitle="Campaigns, contacts, scheduled messages and templates"
      >
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Order texts, alerts and their switches are in <Link to="/notifications" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>System → Notifications</Link>.
        </p>
      </PageHeader>

      <TabScrollRow style={S.sectionBar}>
        {SMS_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-current={currentSection.id === section.id ? 'true' : undefined}
            style={S.sectionTab(currentSection.id === section.id)}
            onClick={() => selectTab(section.tabs[0].id)}
          >
            {section.label}
          </button>
        ))}
      </TabScrollRow>

      {currentSection.tabs.length > 1 ? (
        <TabScrollRow style={S.subTabBar}>
          {currentSection.tabs.map(({ id, label, icon }) => (
            <button key={id} type="button" aria-current={tab === id ? 'true' : undefined} style={S.tab(tab === id)} onClick={() => selectTab(id)}>
              {icon}{label}
            </button>
          ))}
        </TabScrollRow>
      ) : <div style={{ height: 20 }} />}

      {tab === 'campaigns'   && <CampaignsTab prefill={campaignPrefill} onViewLog={(id) => navigate(`/notifications/log?campaign_id=${id}`)} />}
      {tab === 'promotions'  && <PromotionsTab onGoToCampaigns={() => selectTab('campaigns')} />}
      {tab === 'contacts'    && <ContactsTab />}
      {tab === 'templates'   && <TemplatesTab />}
      {tab === 'scheduled'   && <ScheduledTab />}
    </PageShell>
  );
}
