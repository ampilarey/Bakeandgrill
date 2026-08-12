import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  FileText,
  History,
  Home,
  Image,
  Palette,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';

/**
 * Task-based Content & Branding landing (owner IA).
 * Each task opens an existing Content Hub section via `?group=…`.
 */

export type ContentTaskId =
  | 'hero'
  | 'announcement'
  | 'brand_kit'
  | 'website_home'
  | 'website_pages'
  | 'order_home'
  | 'order_wording'
  | 'seo'
  | 'legal'
  | 'history'
  | 'schedule'
  | 'import_export'
  | 'technical';

export type ContentTask = {
  id: ContentTaskId;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Existing Content Hub section name (`?group=`). Null = open Advanced action (More menu). */
  group: string | null;
  /** Optional query hint for home layout app tab (informational; layout editor has its own tabs). */
  homeAppHint?: 'website' | 'order_app';
  /** Opens the More-menu / advanced surface instead of a section. */
  advancedAction?: 'history' | 'schedule' | 'import_export' | 'technical';
};

export type ContentTaskCluster = {
  id: 'quick' | 'website' | 'order_app' | 'advanced';
  label: string;
  tasks: ContentTask[];
};

export const CONTENT_TASK_CLUSTERS: ContentTaskCluster[] = [
  {
    id: 'quick',
    label: 'Quick edits',
    tasks: [
      {
        id: 'hero',
        title: 'Hero banners',
        description: 'Slideshow photos, titles, and buttons',
        icon: Image,
        group: 'Hero',
      },
      {
        id: 'announcement',
        title: 'Announcement',
        description: 'Banner message across the site',
        icon: Bell,
        group: 'Announcements',
      },
      {
        id: 'brand_kit',
        title: 'Brand Kit',
        description: 'Logo, colours, and share image',
        icon: Palette,
        group: 'Branding',
      },
    ],
  },
  {
    id: 'website',
    label: 'Website',
    tasks: [
      {
        id: 'website_home',
        title: 'Home page',
        description: 'Layout and sections customers see first',
        icon: Home,
        group: 'Homepage',
        homeAppHint: 'website',
      },
      {
        id: 'website_pages',
        title: 'Website pages',
        description: 'About, contact, hours, footer',
        icon: FileText,
        group: 'Pages',
      },
    ],
  },
  {
    id: 'order_app',
    label: 'Order App',
    tasks: [
      {
        id: 'order_home',
        title: 'Order app home',
        description: 'Home layout for the ordering app',
        icon: ShoppingBag,
        group: 'Homepage',
        homeAppHint: 'order_app',
      },
      {
        id: 'order_wording',
        title: 'Order app wording',
        description: 'Greeting, modes, checkout, and status text',
        icon: Sparkles,
        group: 'Order App',
      },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    tasks: [
      {
        id: 'seo',
        title: 'SEO',
        description: 'Search titles and descriptions',
        icon: Search,
        group: 'SEO',
      },
      {
        id: 'legal',
        title: 'Legal pages',
        description: 'Privacy, terms, and refunds',
        icon: FileText,
        group: 'Legal',
      },
      {
        id: 'history',
        title: 'History',
        description: 'Past versions of a field (open a section, then ⋯)',
        icon: History,
        group: null,
        advancedAction: 'history',
      },
      {
        id: 'schedule',
        title: 'Scheduled publishing',
        description: 'Publish drafts at a set time',
        icon: Settings2,
        group: null,
        advancedAction: 'schedule',
      },
      {
        id: 'import_export',
        title: 'Import / export',
        description: 'Backup or restore content JSON',
        icon: Settings2,
        group: null,
        advancedAction: 'import_export',
      },
      {
        id: 'technical',
        title: 'Technical content details',
        description: 'General settings, store, and menu behaviour',
        icon: Settings2,
        group: 'General',
      },
    ],
  },
];

/** Map a Content Hub section name → preferred landing cluster (for rail regroup). */
export function clusterIdForSection(sectionName: string): ContentTaskCluster['id'] {
  for (const cluster of CONTENT_TASK_CLUSTERS) {
    for (const task of cluster.tasks) {
      if (task.group === sectionName) return cluster.id;
    }
  }
  if (sectionName === 'Menu' || sectionName === 'Store' || sectionName === 'Status banners' || sectionName === 'Pre-Order' || sectionName === 'Contact' || sectionName === 'About' || sectionName === 'Footer') {
    return sectionName === 'Status banners' || sectionName === 'Pre-Order' ? 'order_app' : 'advanced';
  }
  return 'advanced';
}
