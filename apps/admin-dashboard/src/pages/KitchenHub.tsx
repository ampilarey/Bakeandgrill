import { lazy } from 'react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

/*
 * Kitchen — one page for the kitchen team. Owner, 2026-09-08: "related tabs
 * together and under same settings". Kitchen Handover and the Production
 * Plan were two sidebar entries with two settings tabs; the KDS stays on its
 * own because it is a working screen, not an admin page.
 */

const KitchenProductionPage = lazy(() => import('./KitchenProductionPage'));
const PlanTab = lazy(() => import('./ProductionPlanPage').then((m) => ({ default: m.PlanTab })));
const PlanCalendarTab = lazy(() => import('./ProductionPlanPage').then((m) => ({ default: m.PlanCalendarTab })));
const PlanAccuracyTab = lazy(() => import('./ProductionPlanPage').then((m) => ({ default: m.PlanAccuracyTab })));
const PlanCustomersTab = lazy(() => import('./ProductionPlanPage').then((m) => ({ default: m.PlanCustomersTab })));
const PlanSettingsTab = lazy(() => import('./ProductionPlanPage').then((m) => ({ default: m.PlanSettingsTab })));

const PLAN = ['kitchen.production.plan'] as const;
const HANDOVER = ['kitchen.production.view_all'] as const;
const REPORTS = ['kitchen.production.reports', 'kitchen.production.view_all'] as const;

/*
 * Eleven tabs is too many for one row on a phone, so they are grouped:
 * Plan (what to make), Handover (what was made and what the counter got),
 * and Settings. The hub draws the groups as a first row and the tabs of
 * the group you are in as a second.
 */
export function kitchenTabs(canManage: boolean): HubTab[] {
  return [
    { id: 'plan', group: 'Plan', label: 'Plan', permissions: PLAN, desc: 'What to make for a day, slot by slot, from what has sold on days like it', render: () => <PlanTab canManage={canManage} /> },
    { id: 'holidays', group: 'Plan', label: 'Holidays', permissions: PLAN, desc: 'Holidays, school terms and closures the plan allows for', render: () => <PlanCalendarTab canManage={canManage} /> },
    { id: 'accuracy', group: 'Plan', label: 'How it did', permissions: PLAN, desc: 'Saved plans against what then sold', render: () => <PlanAccuracyTab /> },
    { id: 'customers', group: 'Plan', label: 'Customers', permissions: PLAN, desc: 'What registered customers add to demand', render: () => <PlanCustomersTab /> },
    { id: 'handover', group: 'Handover', label: 'Today', permissions: REPORTS, desc: 'Today’s production and what the counter has received', render: () => <KitchenProductionPage tab="live" /> },
    { id: 'batches', group: 'Handover', label: 'Batches', permissions: HANDOVER, desc: 'Production batches', render: () => <KitchenProductionPage tab="batches" /> },
    { id: 'receiving', group: 'Handover', label: 'Receiving', permissions: HANDOVER, desc: 'Batches waiting for the counter to receive them', render: () => <KitchenProductionPage tab="receiving" /> },
    { id: 'variances', group: 'Handover', label: 'Variances', permissions: ['kitchen.variance.review'], desc: 'Short, over, rejected and remade', render: () => <KitchenProductionPage tab="variances" /> },
    { id: 'waste', group: 'Handover', label: 'Waste', permissions: REPORTS, desc: 'Waste and remakes', render: () => <KitchenProductionPage tab="waste" /> },
    { id: 'staff', group: 'Handover', label: 'Staff output', permissions: REPORTS, desc: 'Batches per cook', render: () => <KitchenProductionPage tab="staff" /> },
    {
      id: 'settings',
      group: 'Settings',
      label: 'Settings',
      permissions: ['kitchen.production.manage'],
      desc: 'Handover rules, and how the plan is worked out',
      render: () => (
        <>
          <KitchenProductionPage tab="settings" />
          <div style={{ marginTop: 24 }}>
            <PlanSettingsTab canManage={canManage} />
          </div>
        </>
      ),
    },
  ];
}

export const KITCHEN_HUB_PERMISSIONS = hubPermissions(kitchenTabs(false));

export function KitchenHub() {
  const { can } = useCurrentUserPermissions();
  return (
    <HubPage
      base="/kitchen"
      section="Monitor"
      title="Kitchen"
      tabs={kitchenTabs(can('kitchen.production.manage'))}
    />
  );
}
