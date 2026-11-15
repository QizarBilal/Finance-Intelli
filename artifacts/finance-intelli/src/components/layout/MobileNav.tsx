import { Link, useLocation } from 'wouter';
import { Heart, LayoutDashboard, Landmark, PieChart, Wallet } from 'lucide-react';

const navItems = [
  { href: '/command', label: 'Today', icon: LayoutDashboard },
  { href: '/transactions', label: 'Activity', icon: Wallet },
  { href: '/accounts', label: 'Accounts', icon: Landmark },
  { href: '/budgets', label: 'Budgets', icon: PieChart },
  { href: '/giving', label: 'Giving', icon: Heart },
];

export default function MobileNav() {
  const [location] = useLocation();

  return (
    <nav aria-label="Main navigation" className="md:hidden fixed bottom-0 left-0 right-0 min-h-16 bg-card/90 backdrop-blur-xl border-t border-border/50 grid grid-cols-5 items-center px-2 pb-[env(safe-area-inset-bottom)] z-50">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = location === href || (href === '/transactions' && location.startsWith('/transactions/'));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium transition-colors ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
