import { Navigate } from 'react-router-dom';

/** Legacy Content Studio routes → unified Content & Branding hub. */
export default function ContentStudioPage() {
  return <Navigate to="/content" replace />;
}

export function WebsiteContentPage() {
  return <Navigate to="/content" replace />;
}

export function OrderAppContentPage() {
  return <Navigate to="/content" replace />;
}
