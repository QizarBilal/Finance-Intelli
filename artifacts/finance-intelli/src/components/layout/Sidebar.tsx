import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, 
  Wallet, 
  PieChart, 
  Target, 
  CalendarDays, 
  Bell, 
  LineChart, 
  FileText, 
  Settings,
  Sparkles,
  LogOut,
  CreditCard
} from 'lucide-react';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import { clearToken } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: Wallet },
  { href: '/budgets', label: 'Budgets', icon: PieChart },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/analytics', label: 'Analytics', icon: LineChart },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/insights', label: 'AI Insights', icon: Sparkles },
];

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  const { data: profile } = useGetMe();
  const logout = useLogout();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        clearToken();
        queryClient.clear();
        setLocation('/login');
      }
    });
  };

  return (
    <aside className="hidden md:flex flex-col w-64 fixed inset-y-0 left-0 border-r border-border/50 bg-card/50 backdrop-blur-xl z-50">
      <div className="h-16 flex items-center px-6 border-b border-border/50">
        <div className="flex items-center gap-2 text-primary font-display font-bold text-xl tracking-tight">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          Finance Intelli
        </div>
      </div>

      <div className="flex-1 py-6 overflow-y-auto px-4 flex flex-col gap-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Overview</div>
        {navItems.slice(0, 4).map((item) => (
          <NavItem key={item.href} {...item} isActive={location === item.href} />
        ))}
        
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-6 mb-2 px-2">Planning</div>
        {navItems.slice(4, 6).map((item) => (
          <NavItem key={item.href} {...item} isActive={location === item.href} />
        ))}
        
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-6 mb-2 px-2">Intelligence</div>
        {navItems.slice(6).map((item) => (
          <NavItem key={item.href} {...item} isActive={location === item.href} />
        ))}
      </div>

      <div className="p-4 border-t border-border/50 mt-auto">
        <Link href="/settings" className={`flex items-center gap-3 px-2 py-2 rounded-md text-sm font-medium transition-colors ${location === '/settings' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
          <Settings className="w-4 h-4" />
          Settings
        </Link>
        
        <div className="mt-4 flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
              {profile?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-none">{profile?.name || 'User'}</span>
              <span className="text-xs text-muted-foreground mt-1">Free Plan</span>
            </div>
          </div>
          <button onClick={handleLogout} className="text-muted-foreground hover:text-destructive transition-colors p-1" title="Logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ href, label, icon: Icon, isActive }: { href: string; label: string; icon: any; isActive: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all group relative ${isActive ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
      {isActive && (
        <span className="absolute left-0 top-1 bottom-1 w-1 bg-primary rounded-r-full" />
      )}
      <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
      {label}
    </Link>
  );
}
