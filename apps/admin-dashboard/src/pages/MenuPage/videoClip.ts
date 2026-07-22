/** Client-side mirrors of config/menu_media.php video limits (no server ffprobe). */
export const MENU_VIDEO_LIMITS = {
  maxBytes: 8192 * 1024,
  maxSeconds: 10,
  accept: 'video/mp4,video/webm',
} as const;

/**
 * Validate a video File, then capture frame 0 as a JPEG poster File.
 */
export async function prepareVideoClip(file: File): Promise<{ video: File; poster: File; duration: number }> {
  if (file.size > MENU_VIDEO_LIMITS.maxBytes) {
    const mb = (MENU_VIDEO_LIMITS.maxBytes / (1024 * 1024)).toFixed(1);
    throw new Error(`Video is too large. Maximum size is ${mb} MB.`);
  }
  if (!/^video\/(mp4|webm)$/i.test(file.type) && !/\.(mp4|webm)$/i.test(file.name)) {
    throw new Error('Video must be MP4 or WebM.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not read video metadata.'));
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) {
      throw new Error('Could not determine video duration.');
    }
    if (duration > MENU_VIDEO_LIMITS.maxSeconds + 0.25) {
      throw new Error(`Video is too long (${duration.toFixed(1)}s). Maximum is ${MENU_VIDEO_LIMITS.maxSeconds}s.`);
    }

    // Seek near the start for a poster frame.
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      try {
        video.currentTime = Math.min(0.1, Math.max(0, duration * 0.05));
      } catch {
        reject(new Error('Could not seek video for poster frame.'));
      }
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, video.videoWidth || 1280);
    canvas.height = Math.max(1, video.videoHeight || 720);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create poster canvas.');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const posterBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not encode poster JPEG.'))),
        'image/jpeg',
        0.85,
      );
    });

    const poster = new File([posterBlob], 'poster.jpg', { type: 'image/jpeg' });
    return { video: file, poster, duration };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
