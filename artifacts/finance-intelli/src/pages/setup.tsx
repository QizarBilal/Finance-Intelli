import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useSetupProfile } from '@workspace/api-client-react';
import { setToken } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CreditCard, Check, ArrowRight, Loader2, IndianRupee } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Setup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const setupMutation = useSetupProfile();

  const [formData, setFormData] = useState({
    username: '',
    name: '',
    password: '',
    currency: 'INR',
    currencySymbol: '₹',
    occupation: '',
    theme: 'dark' as const
  });

  const handleNext = () => {
    if (step === 1 && (!formData.name || !formData.username || !formData.password)) {
      toast({ title: 'Missing fields', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }
    setStep(s => s + 1);
  };

  const handleComplete = () => {
    setupMutation.mutate({ data: formData }, {
      onSuccess: (res) => {
        setToken(res.token);
        queryClient.invalidateQueries();
        setLocation('/dashboard');
      },
      onError: (err) => {
        toast({ title: 'Setup failed', description: (err.data as any)?.error || err.message || 'Something went wrong', variant: 'destructive' });
      }
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-md z-10">
        <div className="mb-10 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-6 shadow-xl shadow-primary/10 border border-primary/20">
            <CreditCard className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Welcome to Finance Intelli
          </h1>
          <p className="text-muted-foreground mt-2">
            Let's set up your private financial operating system.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-8 relative overflow-hidden">
          {/* Progress bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
            <motion.div 
              className="h-full bg-primary"
              initial={{ width: '50%' }}
              animate={{ width: step === 1 ? '50%' : '100%' }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6 pt-4"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input 
                      id="name" 
                      placeholder="e.g. Mohammed Qizar Bilal" 
                      value={formData.name}
                      onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                      className="bg-background/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input 
                      id="username" 
                      placeholder="choose a username" 
                      value={formData.username}
                      onChange={e => setFormData(p => ({ ...p, username: e.target.value }))}
                      className="bg-background/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Master Password</Label>
                    <Input 
                      id="password" 
                      type="password" 
                      placeholder="••••••••" 
                      value={formData.password}
                      onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                      className="bg-background/50"
                    />
                  </div>
                </div>
                <Button className="w-full" size="lg" onClick={handleNext}>
                  Continue <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6 pt-4"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="occupation">Occupation</Label>
                    <Input 
                      id="occupation" 
                      placeholder="e.g. Software Engineer" 
                      value={formData.occupation}
                      onChange={e => setFormData(p => ({ ...p, occupation: e.target.value }))}
                      className="bg-background/50"
                    />
                  </div>
                  
                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <IndianRupee className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">Currency Pre-configured</h4>
                      <p className="text-xs text-muted-foreground mt-1">Your currency is set to Indian Rupee (INR ₹) for a tailored experience.</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="px-4">
                    Back
                  </Button>
                  <Button 
                    className="flex-1" 
                    size="lg" 
                    onClick={handleComplete}
                    disabled={setupMutation.isPending}
                  >
                    {setupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Launch Intelli'}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
