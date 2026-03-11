import { Navigate } from 'react-router-dom';

// Legacy entry point — redirect to the new HomePage
export default function App() {
  return <Navigate to="/" replace />;
}
