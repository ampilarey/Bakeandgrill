import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Zap, Users, FileText, Clock, Cpu, BellRing } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader, PageShell } from '../components/Layout';
import { LogsTab } from './SmsPage/LogsTab';
import { CampaignsTab } from './SmsPage/CampaignsTab';
import { PromotionsTab } from './SmsPage/PromotionsTab';
import { ContactsTab } from './SmsPage/ContactsTab';
import { TemplatesTab } from './SmsPage/TemplatesTab';
import { ScheduledTab } from './SmsPage/ScheduledTab';
import { AutomationsTab } from './SmsPage/AutomationsTab';
import { RecipientsTab } from './SmsPage/RecipientsTab';

type Tab = 'recipients' | 'automations' | 'logs' | 'campaigns' | 'promotions' | 'contacts' | 'templates' | 'scheduled';

const VALID_TABS: Tab[] = ['recipients', 'automations', 'logs', 'campaigns', 'promotions', 'contacts', 'templates', 'scheduled'];

type SmsTabDef = { id: Tab; label: string; icon?: React.ReactNode };

const SMS_SECTIONS: { id: string; label: string; tabs: SmsTabDef[] }[] = [
  {
    id: 'transactional',
    label: 'Transactional',
    tabs: [
      { id: 'recipients' as Tab, label: 'Recipients', icon: <BellRing size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> },
      { id: 'automations' as Tab, label: 'Automations', icon: <Cpu size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> },
      { id: 'logs' as Tab, label: 'Audit Logs' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    tabs: [
      { id: 'campaigns' as Tab, label: 'Campaigns' },
      { id: 'promotions' as Tab, label: 'Promotions', icon: <Zap size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> },
      { id: 'contacts' as Tab, label: 'Contacts & Groups', icon: <Users size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> },
      { id: 'scheduled' as Tab, label: 'Scheduled', icon: <Clock size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> },
    ],
  },
  {
    id: 'library',
    label: 'Library',
    tabs: [
      { id: 'templates' as Tab, label: 'Templates', icon: <FileText size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> },
    ],
  },
];

function sectionForTab(t: Tab) {
  return SMS_SECTIONS.find((s) => s.tabs.some((tab) => tab.id === t)) ?? SMS_SECTIONS[0];
}

const S = {
  sectionTab: (active: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? '#D4813A' : '#9C8E7E',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    borderBottom: active ? '2px solid #D4813A' : '2px solid transparent',
    marginBottom: -2,
    whiteSpace: 'nowrap',
  }),
  sectionBar: {
    marginBottom: 0,
    borderBottom: '2px solid #E8E0D8',
  },
  subTabBar: {
    marginBottom: 20,
    marginTop: 12,
  },
  tab: (active: boolean): React.CSSProperties => ({
    padding: '8px 18px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: active ? 700 : 400,
    background: active ? '#D4813A' : 'transparent',
    color: active ? '#fff' : '#6B5D4F',
    transition: 'all .15s',
    whiteSpace: 'nowrap',
  }),
};

export function SmsPage() {
  usePageTitle('SMS');
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const initialTab: Tab = tabFromUrl && VALID_TABS.includes(tabFromUrl as Tab)
    ? (tabFromUrl as Tab)
    : 'recipients';
  const [tab, setTab] = useState<Tab>(initialTab);
  const currentSection = sectionForTab(tab);

  const campaignPrefill = useMemo(() => ({
    create: searchParams.get('create') === '1',
    segment: searchParams.get('segment') || '',
    message: searchParams.get('message') || '',
  }), [searchParams]);

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
    <>
      <PageHeader section="Customers & Marketing" title="SMS" subtitle="Transactional alerts, marketing campaigns, and message templates" />

      <div className="tab-scroll-row" style={S.sectionBar}>
        {SMS_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            style={S.sectionTab(currentSection.id === section.id)}
            onClick={() => selectTab(section.tabs[0].id)}
          >
            {section.label}
          </button>
        ))}
      </div>

      {currentSection.tabs.length > 1 && (
        <div className="tab-scroll-row" style={S.subTabBar}>
          {currentSection.tabs.map(({ id, label, icon }) => (
            <button key={id} type="button" style={S.tab(tab === id)} onClick={() => selectTab(id)}>
              {icon}{label}
            </button>
          ))}
        </div>
      )}

      {tab === 'recipients'  && <RecipientsTab />}
      {tab === 'automations' && <AutomationsTab />}
      {tab === 'logs'        && <LogsTab />}
      {tab === 'campaigns'   && <CampaignsTab prefill={campaignPrefill} />}
      {tab === 'promotions'  && <PromotionsTab />}
      {tab === 'contacts'    && <ContactsTab />}
      {tab === 'templates'   && <TemplatesTab />}
      {tab === 'scheduled'   && <ScheduledTab />}
    </>

    </PageShell>
  );
}
