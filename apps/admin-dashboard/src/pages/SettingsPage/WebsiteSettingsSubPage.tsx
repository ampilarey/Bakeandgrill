import { Link } from 'react-router-dom';
import { LayoutTemplate, Smartphone } from 'lucide-react';

/**
 * Legacy Website Settings content editors moved to Content Studio.
 * This sub-page points operators at the two app editors.
 */
export function WebsiteSettings() {
  return (
    <div style={{
      maxWidth: 520, padding: 24, borderRadius: 14, background: '#fff',
      border: '1px solid #E8E0D8', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1C1408', fontWeight: 700, fontSize: 16 }}>
        <LayoutTemplate size={18} /> Content editors
      </div>
      <p style={{ margin: 0, fontSize: 14, color: '#6B5D4F', lineHeight: 1.5 }}>
        Website and order-app marketing copy (hero slides, categories, trust items, branding, SEO, and more)
        are edited in separate editors — each app keeps its own values.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link
          to="/content/website"
          style={{
            height: 44, padding: '0 16px', borderRadius: 10,
            background: '#D4813A', color: '#fff', fontWeight: 700, fontSize: 14,
            display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', fontFamily: 'inherit',
          }}
        >
          <LayoutTemplate size={16} /> Website Content
        </Link>
        <Link
          to="/content/order-app"
          style={{
            height: 44, padding: '0 16px', borderRadius: 10,
            background: '#F8F6F3', color: '#1C1408', fontWeight: 700, fontSize: 14,
            display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', fontFamily: 'inherit',
            border: '1px solid #E8E0D8',
          }}
        >
          <Smartphone size={16} /> Order App Content
        </Link>
      </div>
    </div>
  );
}
