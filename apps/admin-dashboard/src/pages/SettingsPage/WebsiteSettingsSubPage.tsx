import { Link } from 'react-router-dom';
import { LayoutTemplate } from 'lucide-react';

/**
 * Legacy Website Settings content editors moved to Content Studio (Stage 6).
 * This sub-page only redirects operators there.
 */
export function WebsiteSettings() {
  return (
    <div style={{
      maxWidth: 520, padding: 24, borderRadius: 14, background: '#fff',
      border: '1px solid #E8E0D8', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1C1408', fontWeight: 700, fontSize: 16 }}>
        <LayoutTemplate size={18} /> Content Studio
      </div>
      <p style={{ margin: 0, fontSize: 14, color: '#6B5D4F', lineHeight: 1.5 }}>
        Website and order-app marketing copy (hero slides, categories, trust items, branding, SEO, and more)
        is edited in Content Studio — with shared or per-app scopes and a live preview.
      </p>
      <Link
        to="/content-studio"
        style={{
          alignSelf: 'flex-start', height: 44, padding: '0 16px', borderRadius: 10,
          background: '#D4813A', color: '#fff', fontWeight: 700, fontSize: 14,
          display: 'inline-flex', alignItems: 'center', textDecoration: 'none', fontFamily: 'inherit',
        }}
      >
        Open Content Studio
      </Link>
    </div>
  );
}
