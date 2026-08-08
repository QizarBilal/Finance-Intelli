import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Search } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const destinations = [
  ['/command', 'Financial command centre'], ['/transactions', 'Transactions'], ['/accounts', 'Accounts'], ['/budgets', 'Budgets'], ['/goals', 'Goals'],
  ['/wealth', 'Net worth, credit and investments'], ['/organize', 'Tax, receipts and household'], ['/studio', 'Dashboard and notifications'], ['/reports', 'Reports'], ['/settings', 'Settings'],
];
export default function GlobalCommand() {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [, navigate] = useLocation();
  const search = useQuery({ queryKey: ['global-search', query], queryFn: () => customFetch<any[]>(`/api/search?q=${encodeURIComponent(query)}`, { responseType: 'json' }), enabled: query.trim().length >= 2 });
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(value => !value); } }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, []);
  const go = (href: string) => { navigate(href); setOpen(false); setQuery(''); };
  const local = destinations.filter(item => item[1].toLowerCase().includes(query.toLowerCase()));
  return <><Button aria-label="Search and commands" variant="outline" className="fixed right-5 top-4 z-40 hidden gap-2 bg-card/80 text-muted-foreground backdrop-blur md:flex" onClick={() => setOpen(true)}><Search className="h-4 w-4"/><span>Search</span><kbd className="rounded border px-1.5 py-0.5 text-[10px]">Ctrl K</kbd></Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="top-[12%] translate-y-0 p-0 sm:max-w-xl"><DialogHeader className="sr-only"><DialogTitle>Search Finance Intelli</DialogTitle></DialogHeader><div className="flex items-center gap-3 border-b px-4"><Search className="h-5 w-5 text-muted-foreground"/><Input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search transactions, accounts, goals, or jump to a page…" className="h-14 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"/></div><div className="max-h-[60vh] overflow-y-auto p-2"><p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pages and actions</p>{local.map(([href, label]) => <button key={href} className="flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm hover:bg-primary/10" onClick={() => go(href)}>{label}</button>)}{search.data?.length ? <><p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your financial data</p>{search.data.map(item => <button key={`${item.type}-${item.id}`} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-primary/10" onClick={() => go(item.href)}><span className="truncate text-sm">{item.title}</span><span className="truncate text-xs text-muted-foreground">{item.subtitle}</span></button>)}</> : null}</div></DialogContent></Dialog></>;
}
