import { useQueryClient } from '@tanstack/react-query';
import { useLogout } from '@workspace/api-client-react';
import { clearToken } from '@/lib/api-client';
import { useLocation } from 'wouter';
import { LogOut, User, Moon, Sun, Bell, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Settings() {
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        clearToken();
        queryClient.clear();
        setLocation('/login');
      }
    });
  };

  const toggleTheme = () => {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
    } else {
      html.classList.add('dark');
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your app preferences and account.</p>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
        
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-lg">Profile Details</h3>
              <p className="text-sm text-muted-foreground">Update your name, occupation, and basic info</p>
            </div>
          </div>
          <Button variant="outline">Edit Profile</Button>
        </div>

        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sun className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-lg">Appearance</h3>
              <p className="text-sm text-muted-foreground">Toggle between light and dark mode</p>
            </div>
          </div>
          <Button variant="outline" onClick={toggleTheme}>Toggle Theme</Button>
        </div>

        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-lg">Export Data</h3>
              <p className="text-sm text-muted-foreground">Download all your financial data as JSON</p>
            </div>
          </div>
          <Button variant="outline">Export Data</Button>
        </div>

      </div>

      <div className="glass-card rounded-2xl p-6 border-destructive/20 border">
        <h3 className="font-medium text-lg text-destructive mb-2">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mb-6">Permanently delete your account and all associated data. This cannot be undone.</p>
        <div className="flex gap-4">
          <Button variant="destructive">Delete Account</Button>
          <Button variant="secondary" onClick={handleLogout}>Log Out</Button>
        </div>
      </div>
    </div>
  );
}
