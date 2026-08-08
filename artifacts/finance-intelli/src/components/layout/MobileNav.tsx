import { Link, useLocation } from 'wouter';
import { Zap, Wallet, Landmark, HeartPulse, Settings } from 'lucide-react';

const navItems = [
  { href: '/command', icon: Zap },
  { href: '/transactions', icon: Wallet },
  { href: '/accounts', icon: Landmark },
  { href: '/wealth', icon: HeartPulse },
  { href: '/settings', icon: Settings },
];

export default function MobileNav() {
  const [location] = useLocation();

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/80 backdrop-blur-xl border-t border-border/50 flex items-center justify-around px-4 z-50">
      {navItems.map((item) => (
        <Link 
          key={item.href} 
          href={item.href}
          className={`p-3 rounded-xl flex items-center justify-center transition-all ${
            location === item.href 
              ? 'bg-primary/20 text-primary' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <item.icon className="w-5 h-5" />
        </Link>
      ))}
    </div>
  );
}
