import { req } from './client';

// ── Social Hub ────────────────────────────────────────────────────────────────
// Posting the business's content to its own social accounts. Channel
// credentials are write-only: the API returns masked summaries, never values.

export interface SocialPlatformCaps {
  text: boolean;
  photo: boolean;
  requires_photo: boolean;
  /** Caption limit for a text post, and the (sometimes tighter) one with a photo. */
  caption_max: number;
  caption_max_photo: number;
  /** Whether the platform takes a video post and a multi-photo post. */
  video?: boolean;
  carousel?: boolean;
  credentials: string[];
}

/** What the platform said the last time we asked whether the channel still works. */
export interface SocialChannelHealth {
  status: 'ok' | 'warning' | 'error';
  message: string;
  account_label: string | null;
  checked_at: string;
  token_expires_at: string | null;
  token_days_left: number | null;
}

export interface SocialChannelRow {
  id: number;
  platform: string;
  name: string;
  remote_account_id: string | null;
  is_enabled: boolean;
  is_test_channel: boolean;
  /** Which caption(s) it posts: both (English then Dhivehi), en, or dv. */
  language: 'both' | 'en' | 'dv';
  last_published_at: string | null;
  credential_summary: Record<string, string>;
  has_credentials: boolean;
  recent_failures: number;
  health: SocialChannelHealth | null;
}

export interface SocialDeliveryRow {
  id: number;
  status: string;
  channel: { id: number; platform: string; name: string } | null;
  permalink: string | null;
  error_class: string | null;
  error_message: string | null;
  attempts: { at: string; outcome: string; error?: string }[];
  published_at: string | null;
  /** Likes, comments, shares as the platform reports them (Facebook and Instagram only). */
  insights: Record<string, number> | null;
  insights_at: string | null;
}

export interface SocialPostRow {
  id: number;
  status: string;
  snapshot: {
    caption: string;
    caption_dv?: string | null;
    image_url: string | null;
    /** A carousel's photos (two or more) when the post is one. */
    images?: string[] | null;
    video_url?: string | null;
    video_poster_url?: string | null;
    video_bytes?: number | null;
    link_url: string | null;
    item_id: number | null;
    price: number | null;
  };
  /** video | carousel | photo | text, derived by the server from the snapshot. */
  media_type?: string;
  source: string;
  source_ref: string | null;
  business_date: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string | null;
  deliveries: SocialDeliveryRow[];
}

/** What linking a menu item freezes into a post: photo, price, names, durable link. */
export interface SocialItemPreview {
  id: number;
  name: string;
  name_dv: string | null;
  category: string | null;
  price: number;
  base_price: number;
  /** The item's shareable photo, or null when it has none (never the site logo). */
  image_url: string | null;
  link_url: string;
  is_sellable: boolean;
  /** Present when the preview was asked for by special: the offer's badge and last day. */
  special?: { id: number; badge_label: string | null; end_date: string | null; is_active: boolean } | null;
  /** Every shareable photo of the item (for a carousel), primary first. */
  gallery?: string[];
  /** Ready video renditions of the item (for a video post). */
  videos?: SocialItemVideo[];
}

export interface SocialItemVideo {
  format: string;
  url: string | null;
  poster_url: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
}

/** What the composer sends beyond one photo: a carousel of photos or a video. */
export interface SocialPostMedia {
  type: 'photo' | 'carousel' | 'video';
  images?: string[];
  video_url?: string | null;
  video_poster_url?: string | null;
  video_bytes?: number | null;
}

export async function fetchSocialItemPreview(
  ref: number | { item_id?: number; special_id?: number },
): Promise<{ item: SocialItemPreview }> {
  const q = typeof ref === 'number'
    ? `item_id=${ref}`
    : ref.special_id ? `special_id=${ref.special_id}` : `item_id=${ref.item_id ?? 0}`;
  return req(`/admin/social/item-preview?${q}`);
}

// ── Announcements: one text to the channels and the TV board ─────────────────

export interface AnnouncementTemplate {
  key: string;
  label: string;
  text: string;
  look: string;
  /** Suggested time on the TV board, in minutes (0 = until removed). */
  minutes: number;
}

export async function fetchAnnouncementTemplates(): Promise<{ templates: AnnouncementTemplate[] }> {
  return req('/admin/social/announcements/templates');
}

export async function createAnnouncement(data: {
  text: string;
  text_dv?: string;
  template?: string | null;
  channel_ids: number[];
  action: 'draft' | 'schedule' | 'now';
  scheduled_at?: string | null;
  signage: {
    enabled: boolean;
    text?: string;
    text_dv?: string;
    look?: string;
    show?: string;
    seconds?: number;
    minutes?: number;
  };
}): Promise<{ post_id: number | null; post_status: string | null; notice: unknown; skipped_channels: string[] }> {
  return req('/admin/social/announcements', { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchSocialChannels(): Promise<{
  channels: SocialChannelRow[];
  platforms: Record<string, SocialPlatformCaps>;
  /** "Connect with Facebook" is offered when the server has a Meta app configured. */
  meta_connect: { available: boolean; redirect_uri: string };
}> {
  return req('/admin/social/channels');
}

// ── Connect with Facebook ────────────────────────────────────────────────────
// start → the browser goes to Facebook → comes back to /admin/social?meta_connect=STATE
// → pending lists the Pages → finish creates (or refreshes) the channels.

export interface MetaPendingPage {
  page_id: string;
  name: string;
  instagram: { ig_user_id: string; username: string } | null;
  already: { facebook: boolean; instagram: boolean };
}

export async function startMetaConnect(): Promise<{ redirect_url: string }> {
  return req('/admin/social/meta/connect');
}

export async function fetchMetaPending(state: string): Promise<{ pages: MetaPendingPage[] }> {
  return req(`/admin/social/meta/pending?state=${encodeURIComponent(state)}`);
}

export async function finishMetaConnect(data: {
  state: string;
  page_id: string;
  facebook: boolean;
  instagram: boolean;
  is_test_channel: boolean;
}): Promise<{ channel_ids: number[] }> {
  return req('/admin/social/meta/finish', { method: 'POST', body: JSON.stringify(data) });
}

/** Composer picker: enabled channels, names + capabilities only (social.view). */
export interface SocialChannelOption {
  id: number;
  platform: string;
  name: string;
  language?: 'both' | 'en' | 'dv';
}

export async function fetchSocialChannelOptions(): Promise<{
  channels: SocialChannelOption[];
  platforms: Record<string, SocialPlatformCaps>;
}> {
  return req('/admin/social/channel-options');
}

export async function createSocialChannel(data: {
  platform: string;
  name: string;
  credentials: Record<string, string>;
  is_enabled?: boolean;
  is_test_channel?: boolean;
  language?: 'both' | 'en' | 'dv';
}): Promise<{ channel: SocialChannelRow }> {
  return req('/admin/social/channels', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSocialChannel(id: number, data: {
  name?: string;
  credentials?: Record<string, string>;
  is_enabled?: boolean;
  is_test_channel?: boolean;
  language?: 'both' | 'en' | 'dv';
}): Promise<{ channel: SocialChannelRow }> {
  return req(`/admin/social/channels/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSocialChannel(id: number): Promise<void> {
  await req(`/admin/social/channels/${id}`, { method: 'DELETE' });
}

export async function testSocialChannel(id: number): Promise<{ post_id: number; delivery_id: number }> {
  return req(`/admin/social/channels/${id}/test`, { method: 'POST', body: JSON.stringify({}) });
}

/** Ask the platform now whether the channel still works (the daily check does the same). */
export async function checkSocialChannel(id: number): Promise<{ channel: SocialChannelRow }> {
  return req(`/admin/social/channels/${id}/check`, { method: 'POST', body: JSON.stringify({}) });
}

export interface SocialPostFilters {
  page?: number;
  status?: string;
  source?: string;
  /** Channel test posts are hidden unless asked for. */
  include_tests?: boolean;
}

export async function fetchSocialPosts(filters: SocialPostFilters | number = {}): Promise<{
  posts: SocialPostRow[];
  meta: { current_page: number; last_page: number; total: number };
}> {
  const f = typeof filters === 'number' ? { page: filters } : filters;
  const qs = new URLSearchParams();
  if (f.page && f.page > 1) qs.set('page', String(f.page));
  if (f.status) qs.set('status', f.status);
  if (f.source) qs.set('source', f.source);
  if (f.include_tests) qs.set('include_tests', '1');
  const q = qs.toString();
  return req(`/admin/social/posts${q ? `?${q}` : ''}`);
}

export async function fetchSocialPost(id: number): Promise<{ post: SocialPostRow }> {
  return req(`/admin/social/posts/${id}`);
}

export async function createSocialPost(data: {
  caption: string;
  caption_dv?: string | null;
  image_url?: string | null;
  media?: SocialPostMedia | null;
  item_id?: number | null;
  channel_ids: number[];
  action: 'draft' | 'schedule' | 'now';
  scheduled_at?: string | null;
  /** Post now even when the spacing rules object (the server answers 409 with next_free_at otherwise). */
  force?: boolean;
}): Promise<{ post: SocialPostRow }> {
  return req('/admin/social/posts', { method: 'POST', body: JSON.stringify(data) });
}

/** Edit a draft / scheduled / awaiting-approval post. Automation posts keep their item and channels. */
export async function updateSocialPost(id: number, data: {
  caption?: string;
  caption_dv?: string | null;
  image_url?: string | null;
  media?: SocialPostMedia | null;
  item_id?: number | null;
  channel_ids?: number[];
  action?: 'draft' | 'schedule';
  scheduled_at?: string | null;
}): Promise<{ post: SocialPostRow }> {
  return req(`/admin/social/posts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function publishSocialPostNow(id: number): Promise<{ post: SocialPostRow }> {
  return req(`/admin/social/posts/${id}/publish`, { method: 'POST', body: JSON.stringify({}) });
}

export async function cancelSocialPost(id: number): Promise<{ post: SocialPostRow }> {
  return req(`/admin/social/posts/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
}

/** Fetch fresh likes/comments/shares for one post's published deliveries. */
export async function refreshSocialInsights(postId: number): Promise<{ post: SocialPostRow }> {
  return req(`/admin/social/posts/${postId}/insights`, { method: 'POST', body: JSON.stringify({}) });
}

export async function retrySocialDelivery(postId: number, deliveryId: number): Promise<void> {
  await req(`/admin/social/posts/${postId}/deliveries/${deliveryId}/retry`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// ── Automations ──────────────────────────────────────────────────────────────
// `special` is the daily special; `new_item` announces recent photographed
// items once each; `featured` rotates the chef's picks on chosen weekdays.

export type SocialAutomationKind = 'special' | 'new_item' | 'featured' | 'weekly' | 'stock';

export interface SocialAutomationConfig {
  enabled: boolean;
  time: string;
  channel_ids: number[];
  template: string;
  /** Pilot gate: false = drafts await human approval before posting. */
  unattended: boolean;
  /** Chef's pick only: weekdays it may post on (0 = Sunday … 6 = Saturday). */
  days: number[];
  /** New on the menu only: how many days an item counts as new. */
  max_age_days: number;
  /** Back in stock only: only chef's picks, and how long it must have been gone. */
  featured_only: boolean;
  min_out_hours: number;
}

export async function fetchSocialAutomation(): Promise<{
  automation: SocialAutomationConfig;
  automations: Record<SocialAutomationKind, SocialAutomationConfig>;
}> {
  return req('/admin/social/automation');
}

export async function updateSocialAutomation(
  data: Partial<SocialAutomationConfig> & { kind?: SocialAutomationKind },
): Promise<{ automation: SocialAutomationConfig; automations: Record<SocialAutomationKind, SocialAutomationConfig> }> {
  return req('/admin/social/automation', { method: 'PUT', body: JSON.stringify(data) });
}

// ── Video renditions ─────────────────────────────────────────────────────────

export interface SocialVideoRenditionRow {
  id: number;
  item_id: number;
  format: string;
  status: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  url: string | null;
  poster_url: string | null;
  error_message: string | null;
  stale: boolean;
  updated_at: string | null;
}

export async function fetchSocialVideos(itemId: number): Promise<{
  renderer_available: boolean;
  has_photos: boolean;
  formats: string[];
  renditions: SocialVideoRenditionRow[];
}> {
  return req(`/admin/social/items/${itemId}/videos`);
}

export async function generateSocialVideo(
  itemId: number,
  format: string,
): Promise<{ rendition: SocialVideoRenditionRow }> {
  return req(`/admin/social/items/${itemId}/videos`, {
    method: 'POST',
    body: JSON.stringify({ format }),
  });
}

export async function deleteSocialVideo(renditionId: number): Promise<void> {
  await req(`/admin/social/videos/${renditionId}`, { method: 'DELETE' });
}

// ── Calendar, posting rules, best times ──────────────────────────────────────

export interface SocialCalendarEntry {
  id: number;
  status: string;
  source: string;
  caption: string;
  image_url: string | null;
  at: string | null;
  /** Maldives-local day and time the post went (or will go) out. */
  date: string | null;
  time: string | null;
  platforms: string[];
}

export interface SocialCalendarSlot {
  kind: SocialAutomationKind;
  date: string;
  time: string;
}

export interface SocialPostingRulesConfig {
  /** 0 = off. */
  min_gap_minutes: number;
  /** 0 = off. */
  max_per_day: number;
}

export interface SocialBestTimesReport {
  sample: number;
  enough: boolean;
  top_hours: number[];
  hours: { hour: number; avg: number; count: number }[];
  weekdays: { day: number; avg: number; count: number }[];
}

export async function fetchSocialCalendar(from: string, to: string): Promise<{
  posts: SocialCalendarEntry[];
  drafts: SocialCalendarEntry[];
  slots: SocialCalendarSlot[];
  rules: SocialPostingRulesConfig;
  best_times: SocialBestTimesReport;
}> {
  return req(`/admin/social/calendar?from=${from}&to=${to}`);
}

/** Move a scheduled post (or schedule a draft) to a day, keeping its time unless given. */
export async function moveSocialPost(id: number, date: string, time?: string): Promise<{ post: SocialCalendarEntry; warning: string | null }> {
  return req(`/admin/social/posts/${id}/move`, { method: 'POST', body: JSON.stringify({ date, ...(time ? { time } : {}) }) });
}

export async function fetchSocialRules(): Promise<{ rules: SocialPostingRulesConfig }> {
  return req('/admin/social/rules');
}

export async function updateSocialRules(data: Partial<SocialPostingRulesConfig>): Promise<{ rules: SocialPostingRulesConfig }> {
  return req('/admin/social/rules', { method: 'PUT', body: JSON.stringify(data) });
}

export async function fetchSocialBestTimes(): Promise<{ best_times: SocialBestTimesReport }> {
  return req('/admin/social/best-times');
}
