import { useState } from 'react';
import { Zap, Users, FileText, Clock, Cpu } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader } from '../components/Layout';
import { LogsTab } from './SmsPage/LogsTab';
import { CampaignsTab } from './SmsPage/CampaignsTab';
import { PromotionsTab } from './SmsPage/PromotionsTab';
import { ContactsTab } from './SmsPage/ContactsTab';
import { TemplatesTab } from './SmsPage/TemplatesTab';
import { ScheduledTab } from './SmsPage/ScheduledTab';
import { AutomationsTab } from './SmsPage/AutomationsTab';

type Tab = 'logs' | 'campaigns' | 'promotions' | 'contacts' | 'templates' | 'scheduled' | 'automations';

const TABS: [Tab, string, React.ReactNode][] = [
  ['logs',        'Audit Logs',       null],
  ['campaigns',   'Campaigns',        null],
  ['promotions',  'Promotions',       <Zap size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />],
  ['contacts',    'Contacts & Groups', <Users size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />],
  ['templates',   'Templates',        <FileText size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />],
  ['scheduled',   'Scheduled',        <Clock size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />],
  ['automations', 'Automations',      <Cpu size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />],
];

export function SmsPage() {
  usePageTitle('SMS');
  const [tab, setTab] = useState<Tab>('logs');

  return (
    <>
      <PageHeader title="SMS" subtitle="Campaigns, templates, scheduled sends, contacts and staff automations" />
      <div style={{ display: 'flex', marginBottom: 20, borderBottom: '2px solid #E8E0D8', flexWrap: 'wrap' }}>
        {TABS.map(([t, label, icon]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 16px', fontSize: 13, fontWeight: tab === t ? 700 : 500,
            color: tab === t ? '#D4813A' : '#9C8E7E',
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: tab === t ? '2px solid #D4813A' : '2px solid transparent',
            marginBottom: -2, transition: 'color 0.15s', whiteSpace: 'nowrap',
          }}>
            {icon}{label}
          </button>
        ))}
      </div>
      {tab === 'logs'        && <LogsTab />}
      {tab === 'campaigns'   && <CampaignsTab />}
      {tab === 'promotions'  && <PromotionsTab />}
      {tab === 'contacts'    && <ContactsTab />}
      {tab === 'templates'   && <TemplatesTab />}
      {tab === 'scheduled'   && <ScheduledTab />}
      {tab === 'automations' && <AutomationsTab />}
    </>
  );
}
