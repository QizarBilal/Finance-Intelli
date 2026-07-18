import { useLocation } from 'wouter';

export default function Index() {
  const [location, setLocation] = useLocation();
  // The App.tsx AuthGuard handles redirecting / to /dashboard or /setup
  return null;
}
