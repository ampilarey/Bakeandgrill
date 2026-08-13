import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Clock,
  Contact,
  FileText,
  History,
  Home,
  Image,
  Info,
  LayoutTemplate,
  Menu,
  MessageSquare,
  Navigation,
  Palette,
  PanelBottom,
  PanelTop,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
  Upload,
} from 'lucide-react';

/**
 * Customer Surface Map landing — Global / Website / Order App / Tools.
 * Every important destination is reachable from desktop and mobile (not rail-only).
 */

export type ContentTaskId =
  | 'brand_profile'
  | 'announcement'
  | 'website_header'
  | 'website_footer'
  | 'order_nav'
  | 'website_home'
  | 'contact_map'
  | 'opening_hours'
  | 'legal'
  | 'seo'
  | 'order_home'
  | 'order_menu'
  | 'order_wording'
  | 'order_about'
  | 'order_contact'
  | 'order_hours'
  | 'order_privacy'
  | 'status_banners'
  | 'catering_events'
  | 'hero'
  | 'history'
  | 'schedule'
  | 'import_export';

export type ContentTask = {
  id: ContentTaskId;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Existing Content Hub section name (`?group=`). Null = advanced action. */
  group: string | null;
  homeAppHint?: 'website' | 'order_app';
  /** Surface Builder deep link (`?surface=app.device.slot`) — opens the Homepage layout editor pre-filtered. */
  surface?: string;
  advancedAction?: 'history' | 'schedule' | 'import_export';
  /** Placement chips shown on the landing card. */
  placements?: string[];
  statusHint?: string;
};

export type ContentTaskCluster = {
  id: 'global' | 'website' | 'order_app' | 'tools';
  label: string;
  tasks: ContentTask[];
};

export const CONTENT_TASK_CLUSTERS: ContentTaskCluster[] = [
  {
    id: 'global',
    label: 'Global',
    tasks: [
      {
        id: 'brand_profile',
        title: 'Business profile & language',
        description: 'Logo, colours, site name, and language-facing brand assets',
        icon: Palette,
        group: 'Branding',
        placements: ['Website header', 'Order App phone home'],
        statusHint: 'Website only',
      },
      {
        id: 'announcement',
        title: 'Announcement',
        description: 'Banner message for this app only',
        icon: Bell,
        group: 'Announcements',
        placements: ['Website header', 'Order App desktop header', 'Order App phone home'],
      },
      {
        id: 'website_header',
        title: 'Website header',
        description: 'Header chrome — components placed on the Website header surface',
        icon: PanelTop,
        group: 'Homepage',
        homeAppHint: 'website',
        surface: 'website.mobile.header',
        placements: ['Website header'],
        statusHint: 'Fixed',
      },
      {
        id: 'website_footer',
        title: 'Website footer',
        description: 'Website footer copy, links, and socials',
        icon: PanelBottom,
        group: 'Footer',
        placements: ['Website footer'],
        statusHint: 'Website only',
      },
      {
        id: 'order_nav',
        title: 'Order App navigation',
        description: 'Bottom navigation tabs in the ordering app',
        icon: Navigation,
        group: 'Homepage',
        homeAppHint: 'order_app',
        surface: 'order_app.mobile.bottom_navigation',
        placements: ['Order App bottom navigation'],
      },
      {
        id: 'hero',
        title: 'Hero banners',
        description: 'Slideshow photos and titles used by Website Home and Order App Home',
        icon: Image,
        group: 'Hero',
        placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
      },
    ],
  },
  {
    id: 'website',
    label: 'Website',
    tasks: [
      {
        id: 'website_home',
        title: 'Home',
        description: 'Reorderable sections plus fixed trust strip, events band, and footer',
        icon: Home,
        group: 'Homepage',
        homeAppHint: 'website',
        placements: ['Website home'],
      },
      {
        id: 'contact_map',
        title: 'Contact & map',
        description: 'Phone, messaging, address, and map on the Website',
        icon: Contact,
        group: 'Contact & map',
        placements: ['Website contact'],
        statusHint: 'Website only',
      },
      {
        id: 'opening_hours',
        title: 'Operating hours',
        description: 'Hours page wording — real café schedule is managed in Online Ordering',
        icon: Clock,
        group: 'Opening hours',
        placements: ['Website hours', 'Order App hours'],
        statusHint: 'Website only',
      },
      {
        id: 'catering_events',
        title: 'Catering & events',
        description: 'Website home band and contact CTAs — not a standalone full page builder',
        icon: LayoutTemplate,
        group: 'Catering & events',
        placements: ['Website home', 'Website contact'],
        statusHint: 'Fixed',
      },
      {
        id: 'legal',
        title: 'Legal pages',
        description: 'Privacy, terms, and refunds on the Website',
        icon: FileText,
        group: 'Legal',
        placements: ['Website legal'],
      },
      {
        id: 'seo',
        title: 'SEO & analytics',
        description: 'Search titles, descriptions, and tracking IDs',
        icon: Search,
        group: 'SEO',
        placements: ['Website header'],
      },
    ],
  },
  {
    id: 'order_app',
    label: 'Order App',
    tasks: [
      {
        id: 'order_home',
        title: 'Home',
        description: 'Phone & desktop home layout — prayer phone block vs desktop header ownership',
        icon: ShoppingBag,
        group: 'Homepage',
        homeAppHint: 'order_app',
        placements: ['Order App phone home', 'Order App desktop home'],
      },
      {
        id: 'order_menu',
        title: 'Menu',
        description: 'Menu page wording and empty-state copy in the Order App',
        icon: Menu,
        group: 'Menu',
        placements: ['Order App menu'],
      },
      {
        id: 'order_wording',
        title: 'Checkout & sign-in wording',
        description: 'Greeting, modes, checkout, and account copy',
        icon: Sparkles,
        group: 'Order App',
        placements: ['Order App checkout', 'Order App phone home'],
      },
      {
        id: 'order_about',
        title: 'About',
        description: 'Order App About page story and values',
        icon: Info,
        group: 'About',
        placements: ['Order App about'],
      },
      {
        id: 'order_contact',
        title: 'Contact',
        description: 'Contact details on the Order App',
        icon: Contact,
        group: 'Contact & map',
        placements: ['Order App contact'],
        statusHint: 'Order App only',
      },
      {
        id: 'order_hours',
        title: 'Hours',
        description: 'Hours page wording — schedule itself lives in Online Ordering',
        icon: Clock,
        group: 'Opening hours',
        placements: ['Order App hours'],
        statusHint: 'Order App only',
      },
      {
        id: 'order_privacy',
        title: 'Privacy',
        description: 'Order App privacy copy (legal pages)',
        icon: FileText,
        group: 'Legal',
        placements: ['Order App privacy'],
      },
      {
        id: 'status_banners',
        title: 'Ordering status banners',
        description: 'Open/closed and service messages customers see while ordering',
        icon: MessageSquare,
        group: 'Status banners',
        placements: ['Order App status banners'],
      },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    tasks: [
      {
        id: 'history',
        title: 'Publishing history',
        description: 'Past versions of a field — open any section, then Advanced → History',
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
        icon: Upload,
        group: null,
        advancedAction: 'import_export',
      },
    ],
  },
];

/** Non-surface destinations shown below the Customer Surface Builder tree. */
export const BRAND_PAGE_TASKS: ContentTask[] = [
  {
    id: 'brand_profile',
    title: 'Brand Kit',
    description: 'Logo, colours, site name, and language-facing brand assets',
    icon: Palette,
    group: 'Branding',
    placements: ['Website header', 'Order App phone home'],
    statusHint: 'Website only',
  },
  {
    id: 'hero',
    title: 'Hero banners',
    description: 'Slideshow photos and titles used by Website Home and Order App Home',
    icon: Image,
    group: 'Hero',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
  },
  {
    id: 'announcement',
    title: 'Announcement',
    description: 'Banner message for this app only',
    icon: Bell,
    group: 'Announcements',
    placements: ['Website header', 'Order App desktop header', 'Order App phone home'],
  },
  {
    id: 'website_footer',
    title: 'Website footer',
    description: 'Website footer copy, links, and socials',
    icon: PanelBottom,
    group: 'Footer',
    placements: ['Website footer'],
    statusHint: 'Website only',
  },
  {
    id: 'website_header',
    title: 'Website header',
    description: 'Header chrome — components placed on the Website header surface',
    icon: PanelTop,
    group: 'Homepage',
    homeAppHint: 'website',
    surface: 'website.mobile.header',
    placements: ['Website header'],
    statusHint: 'Fixed',
  },
  {
    id: 'order_nav',
    title: 'Order App navigation',
    description: 'Bottom navigation tabs in the ordering app',
    icon: Navigation,
    group: 'Homepage',
    homeAppHint: 'order_app',
    surface: 'order_app.mobile.bottom_navigation',
    placements: ['Order App bottom navigation'],
  },
  {
    id: 'seo',
    title: 'SEO & analytics',
    description: 'Search titles, descriptions, and tracking IDs',
    icon: Search,
    group: 'SEO',
    placements: ['Website header'],
  },
  {
    id: 'legal',
    title: 'Legal pages',
    description: 'Privacy, terms, and refunds on the Website',
    icon: FileText,
    group: 'Legal',
    placements: ['Website legal'],
  },
  {
    id: 'opening_hours',
    title: 'Operating hours',
    description: 'Hours page wording — real café schedule is managed in Online Ordering',
    icon: Clock,
    group: 'Opening hours',
    placements: ['Website hours', 'Order App hours'],
    statusHint: 'Website only',
  },
  {
    id: 'contact_map',
    title: 'Contact & map',
    description: 'Phone, messaging, address, and map on the Website',
    icon: Contact,
    group: 'Contact & map',
    placements: ['Website contact'],
    statusHint: 'Website only',
  },
  {
    id: 'catering_events',
    title: 'Catering & events',
    description: 'Website home band and contact CTAs — not a standalone full page builder',
    icon: LayoutTemplate,
    group: 'Catering & events',
    placements: ['Website home', 'Website contact'],
    statusHint: 'Fixed',
  },
  {
    id: 'order_menu',
    title: 'Menu',
    description: 'Menu page wording and empty-state copy in the Order App',
    icon: Menu,
    group: 'Menu',
    placements: ['Order App menu'],
  },
  {
    id: 'order_wording',
    title: 'Checkout & sign-in wording',
    description: 'Greeting, modes, checkout, and account copy',
    icon: Sparkles,
    group: 'Order App',
    placements: ['Order App checkout', 'Order App phone home'],
  },
  {
    id: 'order_about',
    title: 'About',
    description: 'Order App About page story and values',
    icon: Info,
    group: 'About',
    placements: ['Order App about'],
  },
  {
    id: 'order_contact',
    title: 'Contact',
    description: 'Contact details on the Order App',
    icon: Contact,
    group: 'Contact & map',
    placements: ['Order App contact'],
    statusHint: 'Order App only',
  },
  {
    id: 'order_hours',
    title: 'Hours',
    description: 'Hours page wording — schedule itself lives in Online Ordering',
    icon: Clock,
    group: 'Opening hours',
    placements: ['Order App hours'],
    statusHint: 'Order App only',
  },
  {
    id: 'order_privacy',
    title: 'Privacy',
    description: 'Order App privacy copy (legal pages)',
    icon: FileText,
    group: 'Legal',
    placements: ['Order App privacy'],
  },
  {
    id: 'status_banners',
    title: 'Ordering status banners',
    description: 'Open/closed and service messages customers see while ordering',
    icon: MessageSquare,
    group: 'Status banners',
    placements: ['Order App status banners'],
  },
  {
    id: 'history',
    title: 'Publishing history',
    description: 'Past versions of a field — open any section, then Advanced → History',
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
    icon: Upload,
    group: null,
    advancedAction: 'import_export',
  },
];

/** Map a Content Hub section name → preferred landing cluster. */
export function clusterIdForSection(sectionName: string): ContentTaskCluster['id'] {
  for (const cluster of CONTENT_TASK_CLUSTERS) {
    for (const task of cluster.tasks) {
      if (task.group === sectionName) return cluster.id;
    }
  }
  if (sectionName === 'Menu' || sectionName === 'Status banners' || sectionName === 'Pre-Order' || sectionName === 'Order App') {
    return 'order_app';
  }
  if (sectionName === 'General' || sectionName === 'Store' || sectionName === 'SEO' || sectionName === 'Legal') {
    return sectionName === 'SEO' || sectionName === 'Legal' ? 'website' : 'tools';
  }
  if (
    sectionName === 'Homepage'
    || sectionName === 'Contact & map'
    || sectionName === 'Opening hours'
    || sectionName === 'Catering & events'
    || sectionName === 'Footer'
    || sectionName === 'About'
  ) {
    return sectionName === 'About' ? 'order_app' : 'website';
  }
  if (sectionName === 'Hero' || sectionName === 'Announcements' || sectionName === 'Branding') {
    return 'global';
  }
  return 'tools';
}
