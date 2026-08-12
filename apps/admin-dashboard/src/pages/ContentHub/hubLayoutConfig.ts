import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Home,
  Image,
  LayoutTemplate,
  Menu,
  MessageSquare,
  Palette,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Store,
} from 'lucide-react';
import { WEBSITE_PAGE_TASKS } from './websitePageTasks';

/** Cluster id → display label for the section rail (aligned with task landing IA). */
export type HubClusterId = 'quick' | 'website' | 'order_app' | 'advanced';

export type HubSectionMeta = {
  name: string;
  cluster: HubClusterId;
  icon: LucideIcon;
  /** Sub-group headings inside the section editor (large sections). */
  subGroups?: Array<{ id: string; label: string; match: (key: string, label: string) => boolean }>;
};

export const HUB_CLUSTER_ORDER: HubClusterId[] = ['quick', 'website', 'order_app', 'advanced'];

export const HUB_CLUSTER_LABELS: Record<HubClusterId, string> = {
  quick: 'Quick edits',
  website: 'Website',
  order_app: 'Order app',
  advanced: 'Advanced',
};

/**
 * Section → cluster, icon, optional sub-groups.
 * Drive rail / editor from this map — not hardcoded JSX.
 */
export const HUB_SECTIONS: HubSectionMeta[] = [
  { name: 'Hero', cluster: 'quick', icon: Image },
  { name: 'Announcements', cluster: 'quick', icon: Bell },
  { name: 'Branding', cluster: 'quick', icon: Palette },
  {
    name: 'Homepage',
    cluster: 'website',
    icon: Home,
    subGroups: [
      {
        id: 'specials',
        label: 'Specials / Offers',
        match: (key, label) =>
          /specials|offers_/i.test(key) || /specials|offers/i.test(label),
      },
      {
        id: 'featured',
        label: 'Featured',
        match: (key) => /featured/i.test(key),
      },
      {
        id: 'categories',
        label: 'Categories',
        match: (key) => /categories/i.test(key),
      },
      {
        id: 'proof',
        label: 'Social proof',
        match: (key) => /proof/i.test(key),
      },
      {
        id: 'cta',
        label: 'CTA',
        match: (key) => /cta_/i.test(key),
      },
      {
        id: 'location',
        label: 'Location',
        match: (key) => /location/i.test(key),
      },
      {
        id: 'delivery',
        label: 'Delivery cards',
        match: (key) => /delivery|open_badge|closed_badge|hero_fallback/i.test(key),
      },
    ],
  },
  // Focused Website pages (replaces legacy mixed `Pages` + Contact dump).
  ...WEBSITE_PAGE_TASKS.map((page) => ({
    name: page.group,
    cluster: 'website' as const,
    icon: page.icon,
  })),
  { name: 'Order App', cluster: 'order_app', icon: ShoppingBag },
  { name: 'Status banners', cluster: 'order_app', icon: MessageSquare },
  { name: 'Pre-Order', cluster: 'order_app', icon: Sparkles },
  { name: 'SEO', cluster: 'advanced', icon: Search },
  { name: 'Legal', cluster: 'advanced', icon: Shield },
  { name: 'Menu', cluster: 'advanced', icon: Menu },
  { name: 'General', cluster: 'advanced', icon: Settings },
  { name: 'Store', cluster: 'advanced', icon: Store },
];

/** Fallback cluster for unknown section names (was `settings`). */
export const HUB_FALLBACK_CLUSTER: HubClusterId = 'advanced';

const SECTION_BY_NAME = new Map(HUB_SECTIONS.map((s) => [s.name, s]));

export function sectionMeta(name: string): HubSectionMeta {
  return (
    SECTION_BY_NAME.get(name) ?? {
      name,
      cluster: HUB_FALLBACK_CLUSTER,
      icon: LayoutTemplate,
    }
  );
}

/** Preferred rail order (cluster order, then HUB_SECTIONS order). */
export function orderSectionNames(present: string[]): string[] {
  const presentSet = new Set(present);
  const ordered: string[] = [];
  for (const cluster of HUB_CLUSTER_ORDER) {
    for (const section of HUB_SECTIONS) {
      if (section.cluster === cluster && presentSet.has(section.name)) {
        ordered.push(section.name);
      }
    }
  }
  for (const name of present.sort()) {
    if (!ordered.includes(name)) ordered.push(name);
  }
  return ordered;
}

export function clusterSections(
  sectionNames: string[],
): Array<{ cluster: HubClusterId; label: string; sections: string[] }> {
  const ordered = orderSectionNames(sectionNames);
  const byCluster = new Map<HubClusterId, string[]>();
  for (const name of ordered) {
    const meta = sectionMeta(name);
    const list = byCluster.get(meta.cluster) ?? [];
    list.push(name);
    byCluster.set(meta.cluster, list);
  }
  return HUB_CLUSTER_ORDER.filter((id) => (byCluster.get(id)?.length ?? 0) > 0).map((id) => ({
    cluster: id,
    label: HUB_CLUSTER_LABELS[id],
    sections: byCluster.get(id) ?? [],
  }));
}
