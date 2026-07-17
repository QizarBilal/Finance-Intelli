import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Receipt,
  PiggyBank,
  LineChart,
  CalendarDays,
  Target,
  Bell,
  FileText,
  Settings,
  Plus
} from "lucide-react";
import { Button } from "./ui/button";
import { TransactionSlideOver } from "./transaction-slide-over";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/budget", label: "Budget", icon: PiggyBank },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/reports", label: "Reports", icon: FileText },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="fixed inset-y-0 left-0 w-64 glass-panel border-r border-white/5 flex flex-col hidden md:flex z-40">
      <div className="h-16 flex items-center px-6 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center glow-primary">
            <span className="font-bold text-white tracking-tighter">M</span>
          </div>
          <span className="font-semibold text-lg tracking-tight">MoneyMind</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          const Icon = item.icon;
          
          return (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
              isActive 
                ? "bg-white/10 text-white" 
                : "text-muted-foreground hover:bg-white/5 hover:text-white"
            }`}>
              <Icon size={18} className={isActive ? "text-primary" : ""} />
              <span className="font-medium text-sm">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-white/5">
        <Link href="/settings" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
            location.startsWith("/settings") 
              ? "bg-white/10 text-white" 
              : "text-muted-foreground hover:bg-white/5 hover:text-white"
          }`}>
          <Settings size={18} />
          <span className="font-medium text-sm">Settings</span>
        </Link>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const [location] = useLocation();

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 glass-panel border-t border-white/5 z-50 flex items-center justify-around px-2 py-2 pb-safe">
      {NAV_ITEMS.slice(0, 4).map((item) => {
        const isActive = location === item.href;
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className={`p-2 flex flex-col items-center gap-1 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
            <Icon size={20} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
      <Link href="/settings" className={`p-2 flex flex-col items-center gap-1 ${location.startsWith("/settings") ? "text-primary" : "text-muted-foreground"}`}>
        <Settings size={20} />
        <span className="text-[10px] font-medium">More</span>
      </Link>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [slideOverOpen, setSlideOverOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-[#0d0d0f] text-foreground flex font-sans">
      <Sidebar />
      <main className="flex-1 md:ml-64 pb-20 md:pb-0 overflow-x-hidden">
        {children}
      </main>
      <MobileNav />
      <Button 
        size="icon" 
        onClick={() => setSlideOverOpen(true)}
        className="fixed bottom-20 md:bottom-8 right-6 w-14 h-14 rounded-full shadow-2xl glow-primary z-50"
      >
        <Plus size={24} />
      </Button>
      <TransactionSlideOver isOpen={slideOverOpen} onClose={() => setSlideOverOpen(false)} />
    </div>
  );
}