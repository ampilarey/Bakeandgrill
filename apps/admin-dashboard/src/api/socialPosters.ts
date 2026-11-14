import { req } from './client';
import type { PostSpec } from '../components/socialposter/types';

// ── Social Hub → Make a post ─────────────────────────────────────────────────
// A saved post is its words and the design it wears; the pictures are drawn
// in the browser, so only a finished one is ever sent up (to be posted).

export interface SavedSocialPoster {
  id: number;
  name: string;
  layout: string;
  palette: string;
  spec: Partial<PostSpec>;
  updated_at: string | null;
}

export interface SocialPosterBrand {
  name: string;
  tagline: string;
  phone: string;
  website: string;
  order_url: string;
}

export interface SocialPosterPayload {
  name: string;
  layout: string;
  palette: string;
  spec: PostSpec;
}

export async function fetchSocialPosters(): Promise<{ data: SavedSocialPoster[]; brand: SocialPosterBrand }> {
  return req('/admin/social/posters');
}

export async function createSocialPoster(payload: SocialPosterPayload): Promise<{ data: SavedSocialPoster }> {
  return req('/admin/social/posters', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateSocialPoster(id: number, payload: SocialPosterPayload): Promise<{ data: SavedSocialPoster }> {
  return req(`/admin/social/posters/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteSocialPoster(id: number): Promise<{ ok: boolean }> {
  return req(`/admin/social/posters/${id}`, { method: 'DELETE' });
}

/** Turn the browser's recording of an animated post into an MP4; the reply is its address. */
export async function uploadSocialPosterVideo(video: Blob): Promise<{ url: string; converted: boolean }> {
  const form = new FormData();
  form.append('video', video, video.type.includes('mp4') ? 'post.mp4' : 'post.webm');
  return req('/admin/social/posters/video', { method: 'POST', body: form });
}

/** Keep a finished picture where a channel can fetch it; the reply is its address. */
export async function uploadSocialPosterPicture(picture: Blob): Promise<{ url: string; width: number; height: number }> {
  const form = new FormData();
  form.append('picture', picture, 'post.jpg');
  return req('/admin/social/posters/picture', { method: 'POST', body: form });
}
