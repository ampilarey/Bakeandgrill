import { req } from './client';

// ── Social Hub ────────────────────────────────────────────────────────────────
// Posting the business's content to its own social accounts. Channel
// credentials are write-only: the API returns masked summaries, never values.

export interface SocialPlatformCaps {
  text: boolean;
  photo: boolean;
  requires_photo: boolean;
  credentials: string[];
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
  business_date: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string | null;
  deliveries: SocialDeliveryRow[];
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

export async function fetchSocialPosts(page = 1): Promise<{
  posts: SocialPostRow[];
  meta: { current_page: number; last_page: number; total: number };
}> {
  return req(`/admin/social/posts?page=${page}`);
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

export async function publishSocialPostNow(id: number): Promise<{ post: SocialPostRow }> {
  return req(`/admin/social/posts/${id}/publish`, { method: 'POST', body: JSON.stringify({}) });
}

export async function cancelSocialPost(id: number): Promise<{ post: SocialPostRow }> {
  return req(`/admin/social/posts/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
}

export async function retrySocialDelivery(postId: number, deliveryId: number): Promise<void> {
  await req(`/admin/social/posts/${postId}/deliveries/${deliveryId}/retry`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
