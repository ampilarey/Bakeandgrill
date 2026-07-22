import { Navigate } from 'react-router-dom';
import { AppContentEditor } from './AppContentEditor';

/** Legacy `/content-studio` and `/content` → Website Content. */
export default function ContentStudioPage() {
  return <Navigate to="/content/website" replace />;
}

export function WebsiteContentPage() {
  return <AppContentEditor app="website" />;
}

export function OrderAppContentPage() {
  return <AppContentEditor app="order_app" />;
}
