import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, Wallet, PieChart, Target,
  CalendarDays, Bell, LineChart, FileText,
  Settings, Sparkles, LogOut, Zap
} from 'lucide-react';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import { clearToken } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';

const sections = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
      { href: '/transactions', label: 'Transactions', icon: Wallet },
      { href: '/budgets',      label: 'Budgets',      icon: PieChart },
      { href: '/goals',        label: 'Goals',        icon: Target },
    ]
  },
  {
    label: 'Planning',
    items: [
      { href: '/calendar',  label: 'Calendar',  icon: CalendarDays },
      { href: '/reminders', label: 'Reminders', icon: Bell },
    ]
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/analytics', label: 'Analytics',   icon: LineChart },
      { href: '/reports',   label: 'Reports',     icon: FileText },
      { href: '/insights',  label: 'AI Insights', icon: Sparkles },
    ]
  },
];

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  const { data: profile } = useGetMe();
  const logout = useLogout();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => { clearToken(); queryClient.clear(); setLocation('/login'); }
    });
  };

  const initials = profile?.name
    ? profile.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <aside className="hidden md:flex flex-col w-64 fixed inset-y-0 left-0 z-50 sidebar-gradient border-r border-border/40">

      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shadow-md shadow-primary/30">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-[17px] tracking-tight">Finance Intelli</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {sections.map(section => (
          <div key={section.label}>
            <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.12em] px-3 mb-1.5">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map(item => (
                <NavItem key={item.href} {...item} isActive={location === item.href} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-border/40 p-3 space-y-0.5">
        <NavItem href="/settings" label="Settings" icon={Settings} isActive={location === '/settings'} />

        {/* Profile row */}
        <div className="flex items-center gap-3 px-3 py-2.5 mt-1 rounded-xl">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/60 to-primary flex items-center justify-center text-white font-bold text-xs shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-none truncate">{profile?.name || 'User'}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{profile?.occupation || 'Personal'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded-lg hover:bg-destructive/10"
            title="Log out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ href, label, icon: Icon, isActive }: {
  href: string; label: string; icon: any; isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        'group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-primary/12 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/5 dark:hover:bg-white/[0.04]',
      ].join(' ')}
    >
      <div className={[
        'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all',
        isActive
          ? 'bg-primary/20 text-primary'
          : 'text-muted-foreground group-hover:text-foreground',
      ].join(' ')}>
        <Icon className="w-3.5 h-3.5" strokeWidth={isActive ? 2.5 : 2} />
      </div>
      {label}
      {isActive && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
      )}
    </Link>
  );
}
