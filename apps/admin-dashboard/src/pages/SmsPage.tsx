import { useState } from 'react';
import { Zap } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader } from '../components/Layout';
import { LogsTab } from './SmsPage/LogsTab';
import { CampaignsTab } from './SmsPage/CampaignsTab';
import { PromotionsTab } from './SmsPage/PromotionsTab';

type Tab = 'logs' | 'campaigns' | 'promotions';

export function SmsPage() {
  usePageTitle('SMS');
  const [tab, setTab] = useState<Tab>('logs');

  return (
    <>
      <PageHeader title="SMS" subtitle="Logs, bulk campaigns, and automated promotions" />
      <div style={{ display: 'flex', marginBottom: 20, borderBottom: '2px solid #E8E0D8' }}>
        {([['logs', 'Audit Logs'], ['campaigns', 'Campaigns'], ['promotions', 'Promotions']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', fontSize: 14, fontWeight: tab === t ? 700 : 500,
            color: tab === t ? '#D4813A' : '#9C8E7E',
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: tab === t ? '2px solid #D4813A' : '2px solid transparent',
            marginBottom: -2, transition: 'color 0.15s',
          }}>
            {t === 'promotions' && <Zap size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />}
            {label}
          </button>
        ))}
      </div>
      {tab === 'logs' && <LogsTab />}
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'promotions' && <PromotionsTab />}
    </>
  );
}
