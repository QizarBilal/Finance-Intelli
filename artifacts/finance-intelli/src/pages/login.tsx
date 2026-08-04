import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useLogin } from '@workspace/api-client-react';
import { setToken } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Zap, Loader2, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    loginMutation.mutate({ data: { username, password } }, {
      onSuccess: (res) => {
        setToken(res.token);
        queryClient.invalidateQueries();
        setLocation('/dashboard');
      },
      onError: (err: any) => {
        toast({ title: 'Access denied', description: err?.error || 'Invalid credentials.', variant: 'destructive' });
      }
    });
  };

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex flex-col justify-between w-[52%] relative bg-gradient-to-br from-[hsl(224,22%,5%)] to-[hsl(224,24%,9%)] p-12 overflow-hidden">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] -translate-x-1/3 -translate-y-1/3 bg-primary/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] translate-x-1/4 translate-y-1/4 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="flex items-center gap-3 z-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shadow-lg shadow-primary/30">
            <Zap className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-lg text-white/90 tracking-tight">Finance Intelli</span>
        </div>

        <motion.div className="z-10 space-y-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
          <div>
            <h1 className="text-5xl font-display font-bold text-white leading-tight tracking-tight">
              Your money,<br />
              <span className="text-gradient">fully in focus.</span>
            </h1>
            <p className="mt-4 text-white/50 text-base leading-relaxed max-w-sm">
              Track every rupee, hit every goal, and understand where your money really goes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {['Smart analytics', 'Budget tracking', 'Goal planning', 'AI insights'].map(f => (
              <span key={f} className="text-xs font-medium px-3 py-1.5 rounded-full bg-white/6 border border-white/10 text-white/60">{f}</span>
            ))}
          </div>
        </motion.div>

        <p className="z-10 text-white/25 text-xs">Finance Intelli · ₹ INR</p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
        <div className="lg:hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

        <motion.div className="w-full max-w-sm z-10" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shadow-lg shadow-primary/30">
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">Finance Intelli</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-display font-bold tracking-tight">Welcome back</h2>
            <p className="text-muted-foreground text-sm mt-1">Sign in to your workspace</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)}
                className="h-11 bg-card/60 border-border/60 focus-visible:ring-primary/40" placeholder="your-username" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
                className="h-11 bg-card/60 border-border/60 focus-visible:ring-primary/40" placeholder="••••••••" />
            </div>
            <Button className="w-full h-11 mt-2 bg-primary hover:bg-primary/90 font-semibold shadow-md shadow-primary/25 gap-2"
              size="lg" type="submit" disabled={loginMutation.isPending || !username || !password}>
              {loginMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                : <><span>Sign in</span><ArrowRight className="w-4 h-4" /></>}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link href="/signup" className="text-primary hover:text-primary/80 font-medium transition-colors">
              Create one →
            </Link>
          </p>

          <p className="mt-6 text-center text-xs text-muted-foreground/40">
            Secured with JWT · Finance Intelli
          </p>
        </motion.div>
      </div>
    </div>
  );
}
