import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useLogin } from '@workspace/api-client-react';
import { setToken } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CreditCard, Loader2 } from 'lucide-react';
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
      onError: (err) => {
        toast({ title: 'Access Denied', description: err.error || 'Invalid credentials', variant: 'destructive' });
      }
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm z-10"
      >
        <div className="mb-10 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-6 shadow-xl shadow-primary/10 border border-primary/20">
            <CreditCard className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Finance Intelli
          </h1>
          <p className="text-muted-foreground mt-2">
            Welcome back. Please authenticate.
          </p>
        </div>

        <form onSubmit={handleLogin} className="glass-card rounded-2xl p-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input 
                id="username" 
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input 
                id="password" 
                type="password" 
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="bg-background/50"
              />
            </div>
          </div>

          <Button 
            className="w-full" 
            size="lg" 
            type="submit"
            disabled={loginMutation.isPending || !username || !password}
          >
            {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Unlock Workspace'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
