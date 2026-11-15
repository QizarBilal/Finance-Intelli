import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Bell, CheckCheck, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { customFetch } from '@workspace/api-client-react/custom-fetch';

type Notice = { id: number; title: string; message: string; href?: string; readAt?: string | null; createdAt: string };
export default function Notifications() {
  const client = useQueryClient();
  const [, navigate] = useLocation();
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => customFetch<{ items: Notice[] }>('/api/notifications', { responseType: 'json' }) });
  const readAll = useMutation({ mutationFn: () => customFetch('/api/notifications/read-all', { method: 'POST', responseType: 'json' }), onSuccess: () => { client.invalidateQueries({ queryKey: ['notifications'] }); client.invalidateQueries({ queryKey: ['command-center'] }); } });
  const readOne = useMutation({ mutationFn: (id: number) => customFetch(`/api/notifications/${id}/read`, { method: 'PATCH', responseType: 'json' }), onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }) });
  const items = query.data?.items ?? [];
  const unread = items.filter(item => !item.readAt).length;
  return <div className="mx-auto max-w-4xl space-y-7">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bell className="h-5 w-5"/></div><div><h1 className="text-3xl font-display font-bold tracking-tight">Notifications</h1><p className="mt-1 text-sm text-muted-foreground">Important account and money updates, saved in one place.</p></div></div></div><Button variant="outline" disabled={!unread || readAll.isPending} onClick={() => readAll.mutate()}>{readAll.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCheck className="mr-2 h-4 w-4"/>}Mark all as read</Button></header>
    <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card/60 px-5 py-4"><span className="text-sm text-muted-foreground">Unread</span><span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{unread}</span></div>
    {query.isLoading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading your notifications…</div> : items.length ? <div className="space-y-3">{items.map(item => <button key={item.id} onClick={async () => { if (!item.readAt) await readOne.mutateAsync(item.id); const href = item.href?.startsWith('/') ? item.href : '/command'; navigate(href); }} className={`glass-card group flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition hover:border-primary/30 hover:bg-card ${!item.readAt ? 'border-primary/25' : 'border-border/40'}`}><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.readAt ? 'bg-muted' : 'bg-primary'}`}/><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3"><span className="font-semibold">{item.title}</span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5"/></span><span className="mt-1 block text-sm leading-6 text-muted-foreground">{item.message}</span><span className="mt-3 block text-xs text-muted-foreground/70">{new Date(item.createdAt).toLocaleString()}</span></span></button>)}</div> : <div className="glass-card rounded-3xl px-6 py-16 text-center"><Bell className="mx-auto h-9 w-9 text-muted-foreground/40"/><h2 className="mt-4 font-semibold">You’re all caught up</h2><p className="mt-2 text-sm text-muted-foreground">New account, budget and money updates will appear here.</p></div>}
  </div>;
}
