import type { LucideIcon } from 'lucide-react';
import { LayoutTemplate } from 'lucide-react';
import type { ContentApp } from '../../api/content';
import {
  ORDER_APP_HUB_SECTION_ORDER,
  WEBSITE_HUB_SECTION_ORDER,
} from './contentHubGroupMap';
import { HUB_SECTION_ICONS } from './websitePageTasks';

/**
 * Stage 4 — page-first section rail.
 * Clusters are simplified: content sections for the active hub app only.
 */

export type HubClusterId = 'pages' | 'sitewide';

export type HubSectionMeta = {
  name: string;
  cluster: HubClusterId;
  icon: LucideIcon;
  subGroups?: Array<{ id: string; label: string; match: (key: string, label: string) => boolean }>;
};

export const HUB_CLUSTER_ORDER: HubClusterId[] = ['pages', 'sitewide'];

export const HUB_CLUSTER_LABELS: Record<HubClusterId, string> = {
  pages: 'Pages',
  sitewide: 'Site-wide',
};

function metaFor(name: string): HubSectionMeta {
  return {
    name,
    cluster: name === 'Everywhere' ? 'sitewide' : 'pages',
    icon: HUB_SECTION_ICONS[name] ?? LayoutTemplate,
    subGroups: name === 'Home'
      ? [
          {
            id: 'order_buttons',
            label: 'Order buttons',
            match: (key) => /^order_mode_/i.test(key),
          },
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
        ]
      : undefined,
  };
}

/** Preferred rail order for the active hub app. */
export function orderSectionNames(present: string[], app: ContentApp = 'website'): string[] {
  const presentSet = new Set(present);
  const order = app === 'order_app' ? ORDER_APP_HUB_SECTION_ORDER : WEBSITE_HUB_SECTION_ORDER;
  const ordered: string[] = order.filter((name) => presentSet.has(name));
  for (const name of [...present].sort()) {
    if (!ordered.includes(name)) ordered.push(name);
  }
  return ordered;
}

export function sectionMeta(name: string): HubSectionMeta {
  return metaFor(name);
}

export function clusterSections(
  sectionNames: string[],
  app: ContentApp = 'website',
): Array<{ cluster: HubClusterId; label: string; sections: string[] }> {
  const ordered = orderSectionNames(sectionNames, app);
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
