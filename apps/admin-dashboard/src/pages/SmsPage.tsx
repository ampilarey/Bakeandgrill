import { useState } from 'react';
import { Zap, Users, FileText, Clock, Cpu, BellRing } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader } from '../components/Layout';
import { LogsTab } from './SmsPage/LogsTab';
import { CampaignsTab } from './SmsPage/CampaignsTab';
import { PromotionsTab } from './SmsPage/PromotionsTab';
import { ContactsTab } from './SmsPage/ContactsTab';
import { TemplatesTab } from './SmsPage/TemplatesTab';
import { ScheduledTab } from './SmsPage/ScheduledTab';
import { AutomationsTab } from './SmsPage/AutomationsTab';
import { RecipientsTab } from './SmsPage/RecipientsTab';

type Tab = 'recipients' | 'automations' | 'logs' | 'campaigns' | 'promotions' | 'contacts' | 'templates' | 'scheduled';

const TABS: [Tab, string, React.ReactNode][] = [
  ['recipients',  'Recipients',        <BellRing size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />],
  ['automations', 'Automations',       <Cpu size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />],
  ['logs',        'Audit Logs',        null],
  ['campaigns',   'Campaigns',         null],
  ['promotions',  'Promotions',        <Zap size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />],
  ['contacts',    'Contacts & Groups', <Users size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />],
  ['templates',   'Templates',         <FileText size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />],
  ['scheduled',   'Scheduled',         <Clock size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />],
];

export function SmsPage() {
  usePageTitle('SMS');
  const [tab, setTab] = useState<Tab>('recipients');

  return (
    <>
      <PageHeader title="SMS" subtitle="Manage notification recipients, campaigns, templates, scheduled sends and automations" />
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
      {tab === 'recipients'  && <RecipientsTab />}
      {tab === 'automations' && <AutomationsTab />}
      {tab === 'logs'        && <LogsTab />}
      {tab === 'campaigns'   && <CampaignsTab />}
      {tab === 'promotions'  && <PromotionsTab />}
      {tab === 'contacts'    && <ContactsTab />}
      {tab === 'templates'   && <TemplatesTab />}
      {tab === 'scheduled'   && <ScheduledTab />}
    </>
  );
}
