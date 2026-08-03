import { SignageBanner, type SignageBannerItem, type SignageBannerSettings } from '@shared/signage';
import '@shared/signage/signage.css';

type Props = {
  enabled: boolean;
  banners: SignageBannerItem[];
  boardBackground?: string;
  logoUrl?: string | null;
  showLogoBetween?: boolean;
};

const PREVIEW_NOW = Date.parse('2026-08-03T12:00:00+05:00');

/**
 * Live strip using the real SignageBanner so admin preview cannot drift from the TV.
 */
export function BannerLivePreview({
  enabled,
  banners,
  boardBackground = '#1C1408',
  logoUrl = null,
  showLogoBetween = false,
}: Props) {
  const previewBanner: SignageBannerItem = banners.find((b) => b.enabled) ?? banners[0];
  if (!previewBanner) return null;

  const settings: SignageBannerSettings = {
    enabled: true,
    show_logo_between: showLogoBetween,
    banners: [{ ...previewBanner, enabled: true, duration_seconds: 60 }],
  };

  return (
    <div
      data-testid="signage-banner-preview"
      style={{
        position: 'relative',
        width: '100%',
        height: 72,
        marginBottom: 16,
        borderRadius: 12,
        overflow: 'hidden',
        background: boardBackground,
        border: '1px solid var(--color-border)',
      }}
    >
      {!enabled && (
        <div
          data-testid="signage-banner-preview-off"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
            color: 'var(--color-text-inverse, var(--color-text))',
            fontSize: 12,
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          Preview (banners currently off)
        </div>
      )}
      <SignageBanner
        banner={settings}
        schedule={[
          { name: 'Dhuhr', at: '2026-08-03T12:10:00+05:00' },
        ]}
        mode="normal"
        nowMs={PREVIEW_NOW}
        logoUrl={logoUrl}
        variables={{
          wifi_name: 'BG-Guest',
          wifi_password: 'secret',
          business_phone: '1234567',
        }}
      />
    </div>
  );
}
