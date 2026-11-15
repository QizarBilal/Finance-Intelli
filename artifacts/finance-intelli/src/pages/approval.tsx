import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock3, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { customFetch } from '@workspace/api-client-react/custom-fetch';

export default function Approval() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') ?? '';
  const requested = params.get('decision');
  const decision = requested === 'reject' ? 'reject' : requested === 'verify' ? 'verify' : 'approve';
  const [done, setDone] = useState<{ status: string; message: string } | null>(null);
  const mutation = useMutation({ mutationFn: () => customFetch<{ status: string; message: string }>(decision === 'verify' ? `/api/auth/signup-requests/verify/${encodeURIComponent(token)}` : `/api/auth/signup-requests/${encodeURIComponent(token)}/${decision}`, { method: 'POST', responseType: 'json' }), onSuccess: setDone });
  const expired = mutation.error instanceof Error && /expired|already been used|invalid approval link/i.test(mutation.error.message);
  const title = done ? (done.status === 'approved' ? 'Account approved' : done.status === 'verified' ? 'Email confirmed' : 'Request declined') : expired ? 'Link no longer active' : decision === 'verify' ? 'Confirm your email?' : decision === 'approve' ? 'Approve signup request?' : 'Decline signup request?';
  return <main className="min-h-screen bg-background px-5 py-12 flex items-center justify-center"><section className="w-full max-w-lg rounded-3xl border border-border/60 bg-card/80 p-8 text-center shadow-2xl shadow-black/10">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Zap className="h-6 w-6"/></div>
    <p className="mt-5 text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">Finance Intelli · owner review</p>
    <h1 className="mt-3 text-2xl font-display font-bold">{title}</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">{done?.message ?? mutation.error?.message ?? (decision === 'verify' ? 'Confirm that you can receive email at this address. The workspace owner will then receive your request to review.' : decision === 'approve' ? 'Approving creates the account and sends the applicant a confirmation email. This secure email link can only be used once.' : 'Declining permanently removes the pending password hash and sends the applicant a status email.')}</p>
    {!token ? <p className="mt-6 text-sm text-destructive">This link is missing its secure confirmation token.</p> : done || expired ? <div className="mt-7 flex justify-center text-primary">{done?.status === 'approved' || done?.status === 'verified' ? <CheckCircle2 className="h-8 w-8"/> : <Clock3 className="h-8 w-8"/>}</div> : <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center"><Button onClick={() => mutation.mutate()} disabled={mutation.isPending} variant={decision === 'reject' ? 'destructive' : 'default'}>{mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : decision === 'reject' ? <XCircle className="mr-2 h-4 w-4"/> : <CheckCircle2 className="mr-2 h-4 w-4"/>}{decision === 'reject' ? 'Confirm decline' : decision === 'verify' ? 'Confirm email' : 'Confirm approval'}</Button>{decision !== 'verify' && <Button variant="outline" onClick={() => setLocation('/login')}>Cancel</Button>}</div>}
    {mutation.error && !expired && <p role="alert" className="mt-4 text-sm text-destructive">{mutation.error.message}</p>}
    <Link href="/login" className="mt-8 inline-flex text-sm font-medium text-primary">Return to sign in</Link>
  </section></main>;
}
