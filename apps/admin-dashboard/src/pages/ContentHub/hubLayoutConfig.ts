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

/** Cluster id → display label for the section rail (aligned with surface map IA). */
export type HubClusterId = 'global' | 'website' | 'order_app' | 'tools';

export type HubSectionMeta = {
  name: string;
  cluster: HubClusterId;
  icon: LucideIcon;
  /** Sub-group headings inside the section editor (large sections). */
  subGroups?: Array<{ id: string; label: string; match: (key: string, label: string) => boolean }>;
};

export const HUB_CLUSTER_ORDER: HubClusterId[] = ['global', 'website', 'order_app', 'tools'];

export const HUB_CLUSTER_LABELS: Record<HubClusterId, string> = {
  global: 'Global',
  website: 'Website',
  order_app: 'Order App',
  tools: 'Tools',
};

/**
 * Section → cluster, icon, optional sub-groups.
 * Drive rail / editor from this map — not hardcoded JSX.
 */
export const HUB_SECTIONS: HubSectionMeta[] = [
  { name: 'Branding', cluster: 'global', icon: Palette },
  { name: 'Announcements', cluster: 'global', icon: Bell },
  { name: 'Hero', cluster: 'global', icon: Image },
  { name: 'Footer', cluster: 'global', icon: LayoutTemplate },
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
        match: (key) => /location|home_visit|home_delivery|home_directions|home_call|home_chat|home_order_via/i.test(key),
      },
      {
        id: 'delivery',
        label: 'Delivery cards',
        match: (key) => /open_badge|closed_badge|hero_fallback/i.test(key),
      },
    ],
  },
  ...WEBSITE_PAGE_TASKS.filter((p) => p.id !== 'about' && p.id !== 'footer').map((page) => ({
    name: page.group,
    cluster: 'website' as const,
    icon: page.icon,
  })),
  { name: 'About', cluster: 'order_app', icon: LayoutTemplate },
  { name: 'SEO', cluster: 'website', icon: Search },
  { name: 'Legal', cluster: 'website', icon: Shield },
  { name: 'Order App', cluster: 'order_app', icon: ShoppingBag },
  { name: 'Menu', cluster: 'order_app', icon: Menu },
  { name: 'Status banners', cluster: 'order_app', icon: MessageSquare },
  { name: 'Pre-Order', cluster: 'order_app', icon: Sparkles },
  { name: 'General', cluster: 'tools', icon: Settings },
  { name: 'Store', cluster: 'tools', icon: Store },
];

/** Fallback cluster for unknown section names. */
export const HUB_FALLBACK_CLUSTER: HubClusterId = 'tools';

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
