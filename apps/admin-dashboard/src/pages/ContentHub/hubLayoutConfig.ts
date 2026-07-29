import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Contact,
  FileText,
  Home,
  Image,
  Info,
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

/** Cluster id → display label for the section rail / mobile grid. */
export type HubClusterId = 'brand' | 'home' | 'pages' | 'order_app' | 'settings';

export type HubSectionMeta = {
  name: string;
  cluster: HubClusterId;
  icon: LucideIcon;
  /** Sub-group headings inside the section editor (large sections). */
  subGroups?: Array<{ id: string; label: string; match: (key: string, label: string) => boolean }>;
};

export const HUB_CLUSTER_ORDER: HubClusterId[] = ['brand', 'home', 'pages', 'order_app', 'settings'];

export const HUB_CLUSTER_LABELS: Record<HubClusterId, string> = {
  brand: 'Brand',
  home: 'Home',
  pages: 'Pages',
  order_app: 'Order app',
  settings: 'Settings',
};

/**
 * Section → cluster, icon, optional sub-groups.
 * Drive rail / editor from this map — not hardcoded JSX.
 */
export const HUB_SECTIONS: HubSectionMeta[] = [
  { name: 'Branding', cluster: 'brand', icon: Palette },
  { name: 'Hero', cluster: 'home', icon: Image },
  {
    name: 'Homepage',
    cluster: 'home',
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
      {
        id: 'order',
        label: 'Section order',
        match: (key) => key === 'home_section_order',
      },
    ],
  },
  { name: 'Announcements', cluster: 'home', icon: Bell },
  {
    name: 'Pages',
    cluster: 'pages',
    icon: FileText,
    subGroups: [
      {
        id: 'contact',
        label: 'Contact',
        match: (key) => /^contact_/i.test(key) || key === 'maps_embed_url',
      },
      {
        id: 'hours',
        label: 'Hours',
        match: (key) => /^hours_/i.test(key),
      },
      {
        id: 'about',
        label: 'About',
        match: (key) => /^about_/i.test(key) || key === 'about_values',
      },
      {
        id: 'privacy',
        label: 'Privacy',
        match: (key) => /^privacy_/i.test(key),
      },
      {
        id: 'terms',
        label: 'Terms',
        match: (key) => /^terms_/i.test(key),
      },
      {
        id: 'refund',
        label: 'Refund',
        match: (key) => /^refund_/i.test(key),
      },
      {
        id: 'events',
        label: 'Events',
        match: (key) => /^events_/i.test(key) || /events_cta/i.test(key),
      },
      {
        id: 'office',
        label: 'Office orders',
        match: (key) => /^office_orders_/i.test(key),
      },
      {
        id: 'shared_home',
        label: 'Shared home content',
        match: (key) =>
          key === 'homepage_categories' || key === 'trust_items' || key === 'proof_details',
      },
    ],
  },
  { name: 'Contact', cluster: 'pages', icon: Contact },
  { name: 'About', cluster: 'pages', icon: Info },
  { name: 'Legal', cluster: 'pages', icon: Shield },
  { name: 'Footer', cluster: 'pages', icon: LayoutTemplate },
  { name: 'SEO', cluster: 'pages', icon: Search },
  { name: 'Menu', cluster: 'order_app', icon: Menu },
  { name: 'Order App', cluster: 'order_app', icon: ShoppingBag },
  { name: 'Status banners', cluster: 'order_app', icon: MessageSquare },
  { name: 'Pre-Order', cluster: 'order_app', icon: Sparkles },
  { name: 'General', cluster: 'settings', icon: Settings },
  { name: 'Store', cluster: 'settings', icon: Store },
];

const SECTION_BY_NAME = new Map(HUB_SECTIONS.map((s) => [s.name, s]));

export function sectionMeta(name: string): HubSectionMeta {
  return (
    SECTION_BY_NAME.get(name) ?? {
      name,
      cluster: 'settings',
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
