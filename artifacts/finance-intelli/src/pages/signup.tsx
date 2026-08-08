import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useSetupProfile } from '@workspace/api-client-react';
import { setToken } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Zap, Loader2, ArrowRight, ArrowLeft, IndianRupee, User, Lock, Briefcase, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const STEPS = ['Account', 'Profile'];

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const signupMutation = useSetupProfile();
  const [step, setStep] = useState(0);

  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    confirmPassword: '',
    occupation: '',
    jobStatus: '',
    currency: 'INR',
    currencySymbol: '₹',
    theme: 'dark' as const,
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const validateStep0 = () => {
    if (!form.name.trim()) return 'Full name is required.';
    if (form.username.length < 3) return 'Username must be at least 3 characters.';
    if (form.password.length < 6) return 'Password must be at least 6 characters.';
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateStep0();
    if (err) { toast({ title: 'Check your details', description: err, variant: 'destructive' }); return; }
    setStep(1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signupMutation.mutate(
      { data: { name: form.name, username: form.username, password: form.password, occupation: form.occupation || undefined, jobStatus: form.jobStatus || undefined, currency: form.currency, currencySymbol: form.currencySymbol, theme: form.theme } },
      {
        onSuccess: (res) => {
          setToken(res.token);
          queryClient.invalidateQueries();
          setLocation('/dashboard');
        },
        onError: (err: any) => {
          const msg = err?.error || 'Something went wrong.';
          toast({ title: 'Sign up failed', description: msg, variant: 'destructive' });
          if (msg.toLowerCase().includes('username') || msg.toLowerCase().includes('exists')) setStep(0);
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex flex-col justify-between w-[52%] relative bg-gradient-to-br from-[hsl(224,22%,5%)] to-[hsl(224,24%,9%)] p-12 overflow-hidden">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] -translate-x-1/3 -translate-y-1/3 bg-primary/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] translate-x-1/4 translate-y-1/4 bg-red-500/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="flex items-center gap-3 z-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-400 via-primary to-red-800 flex items-center justify-center shadow-lg shadow-primary/30">
            <Zap className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-lg text-white/90 tracking-tight">Finance Intelli</span>
        </div>

        <motion.div className="z-10 space-y-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
          <div>
            <h1 className="text-5xl font-display font-bold text-white leading-tight tracking-tight">
              Start your<br />
              <span className="text-gradient">financial OS.</span>
            </h1>
            <p className="mt-4 text-white/50 text-base leading-relaxed max-w-sm">
              Set up your workspace in under a minute. Your data, your rules, fully private.
            </p>
          </div>

          {/* Step indicators */}
          <div className="space-y-3">
            {[
              { label: 'Create your account', desc: 'Username, password & name', icon: User },
              { label: 'Set up your profile', desc: 'Occupation & preferences', icon: Briefcase },
            ].map((s, i) => (
              <div key={i} className={`flex items-center gap-3 transition-opacity duration-300 ${i > step ? 'opacity-30' : 'opacity-100'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${i < step ? 'bg-primary/30' : i === step ? 'bg-primary/20 ring-2 ring-primary/50' : 'bg-white/5'}`}>
                  {i < step
                    ? <CheckCircle2 className="w-4 h-4 text-primary" />
                    : <s.icon className={`w-4 h-4 ${i === step ? 'text-primary' : 'text-white/30'}`} />}
                </div>
                <div>
                  <p className={`text-sm font-medium ${i === step ? 'text-white' : 'text-white/50'}`}>{s.label}</p>
                  <p className="text-xs text-white/30">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="z-10 text-white/25 text-xs">Finance Intelli · ₹ INR · Replit DB</p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        <div className="lg:hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-sm z-10">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-400 via-primary to-red-800 flex items-center justify-center shadow-lg shadow-primary/30">
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">Finance Intelli</span>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-2xl font-display font-bold tracking-tight">
                  {step === 0 ? 'Create account' : 'Your profile'}
                </h2>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {step === 0 ? 'Step 1 of 2 — credentials' : 'Step 2 of 2 — personalize'}
                </p>
              </div>
              <span className="text-xs text-muted-foreground/60 font-mono">{step + 1}/2</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <motion.div className="h-full bg-primary rounded-full" animate={{ width: step === 0 ? '50%' : '100%' }} transition={{ duration: 0.35 }} />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.form key="step0" onSubmit={handleNext}
                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.25 }} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" autoComplete="name" value={form.name} onChange={set('name')}
                    className="h-11 bg-card/60 border-border/60 focus-visible:ring-primary/40" placeholder="Mohammed Qizar Bilal" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input id="username" autoComplete="username" value={form.username} onChange={set('username')}
                      className="h-11 pl-9 bg-card/60 border-border/60 focus-visible:ring-primary/40" placeholder="qizar" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')}
                      className="h-11 pl-9 bg-card/60 border-border/60 focus-visible:ring-primary/40" placeholder="min. 6 characters" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input id="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')}
                      className="h-11 pl-9 bg-card/60 border-border/60 focus-visible:ring-primary/40" placeholder="••••••••" />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 mt-2 bg-primary hover:bg-primary/90 font-semibold shadow-md shadow-primary/25 gap-2">
                  Continue <ArrowRight className="w-4 h-4" />
                </Button>
              </motion.form>
            )}

            {step === 1 && (
              <motion.form key="step1" onSubmit={handleSubmit}
                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.25 }} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="occupation">Occupation <span className="text-muted-foreground/60 text-xs">(optional)</span></Label>
                  <Input id="occupation" value={form.occupation} onChange={set('occupation')}
                    className="h-11 bg-card/60 border-border/60 focus-visible:ring-primary/40" placeholder="e.g. Software Engineer" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="jobStatus">Job Status <span className="text-muted-foreground/60 text-xs">(optional)</span></Label>
                  <Input id="jobStatus" value={form.jobStatus} onChange={set('jobStatus')}
                    className="h-11 bg-card/60 border-border/60 focus-visible:ring-primary/40" placeholder="e.g. Full-time, Freelance" />
                </div>

                {/* Currency info card */}
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-primary/8 border border-primary/20">
                  <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <IndianRupee className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Indian Rupee (INR ₹)</p>
                    <p className="text-xs text-muted-foreground">Pre-configured as your currency</p>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <Button type="button" variant="outline" onClick={() => setStep(0)} className="gap-2 px-4">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button type="submit" disabled={signupMutation.isPending}
                    className="flex-1 h-11 bg-primary hover:bg-primary/90 font-semibold shadow-md shadow-primary/25 gap-2">
                    {signupMutation.isPending
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                      : <><Zap className="w-4 h-4" /> Launch Intelli</>}
                  </Button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
              Sign in →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
