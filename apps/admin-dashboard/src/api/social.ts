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
    image_url: string | null;
    link_url: string | null;
    item_id: number | null;
    price: number | null;
  };
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
}

export async function fetchSocialItemPreview(itemId: number): Promise<{ item: SocialItemPreview }> {
  return req(`/admin/social/item-preview?item_id=${itemId}`);
}

export async function fetchSocialChannels(): Promise<{
  channels: SocialChannelRow[];
  platforms: Record<string, SocialPlatformCaps>;
}> {
  return req('/admin/social/channels');
}

/** Composer picker: enabled channels, names + capabilities only (social.view). */
export interface SocialChannelOption {
  id: number;
  platform: string;
  name: string;
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
}): Promise<{ channel: SocialChannelRow }> {
  return req('/admin/social/channels', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSocialChannel(id: number, data: {
  name?: string;
  credentials?: Record<string, string>;
  is_enabled?: boolean;
  is_test_channel?: boolean;
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
  image_url?: string | null;
  item_id?: number | null;
  channel_ids: number[];
  action: 'draft' | 'schedule' | 'now';
  scheduled_at?: string | null;
}): Promise<{ post: SocialPostRow }> {
  return req('/admin/social/posts', { method: 'POST', body: JSON.stringify(data) });
}

/** Edit a draft / scheduled / awaiting-approval post. Automation posts keep their item and channels. */
export async function updateSocialPost(id: number, data: {
  caption?: string;
  image_url?: string | null;
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

export type SocialAutomationKind = 'special' | 'new_item' | 'featured';

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
