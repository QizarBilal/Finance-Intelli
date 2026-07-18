import { useState } from 'react';
import { useListReminders, useCreateReminder, useCompleteReminder, useDeleteReminder, Reminder } from '@workspace/api-client-react';
import { Plus, Bell, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function Reminders() {
  const { data: remindersData, isLoading } = useListReminders();
  const reminders = (Array.isArray(remindersData) ? remindersData : []) as Reminder[];
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createReminder = useCreateReminder();
  const completeReminder = useCompleteReminder();
  const deleteReminder = useDeleteReminder();

  const [isFormOpen, setIsFormOpen] = useState(false);

  const pending = reminders.filter(r => !r.isCompleted).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const completed = reminders.filter(r => r.isCompleted).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  const handleComplete = (id: number) => {
    completeReminder.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Marked as completed' });
        queryClient.invalidateQueries();
      }
    });
  };

  const handleDelete = (id: number) => {
    if(!confirm('Delete this reminder?')) return;
    deleteReminder.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries();
      }
    });
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Reminders</h1>
          <p className="text-muted-foreground mt-1">Never miss a bill payment again.</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Reminder
        </Button>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" /> Upcoming
          </h2>
          {pending.length > 0 ? (
            <div className="grid gap-3">
              {pending.map(reminder => {
                const isOverdue = new Date(reminder.dueDate).getTime() < new Date().getTime();
                return (
                  <div key={reminder.id} className="glass-card rounded-xl p-4 flex items-center justify-between group border-l-4" style={{ borderLeftColor: isOverdue ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }}>
                    <div className="flex items-center gap-4">
                      <Button variant="outline" size="icon" className="rounded-full w-8 h-8 shrink-0 hover:bg-emerald-500 hover:text-white hover:border-emerald-500" onClick={() => handleComplete(reminder.id)}>
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                      <div>
                        <div className="font-medium text-foreground">{reminder.title}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span className={isOverdue ? 'text-destructive font-medium' : ''}>Due: {formatDate(reminder.dueDate)}</span>
                          <span>•</span>
                          <span className="capitalize">{reminder.type}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {reminder.amount && (
                        <div className="font-mono font-medium text-lg">{formatCurrency(reminder.amount)}</div>
                      )}
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDelete(reminder.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center glass-card rounded-xl text-muted-foreground">No pending reminders. You're all caught up!</div>
          )}
        </div>

        {completed.length > 0 && (
          <div className="opacity-60">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-muted-foreground" /> Completed
            </h2>
            <div className="grid gap-2">
              {completed.map(reminder => (
                <div key={reminder.id} className="bg-muted/30 rounded-xl p-3 flex items-center justify-between line-through">
                  <div>
                    <div className="text-sm font-medium">{reminder.title}</div>
                  </div>
                  {reminder.amount && <div className="text-sm font-mono">{formatCurrency(reminder.amount)}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <ReminderForm onClose={() => setIsFormOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReminderForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createReminder = useCreateReminder();

  const [formData, setFormData] = useState({
    title: '',
    type: 'bills' as any,
    amount: '',
    dueDate: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.dueDate) return;

    createReminder.mutate({ 
      data: {
        ...formData,
        amount: formData.amount ? parseFloat(formData.amount) : undefined
      } 
    }, {
      onSuccess: () => {
        toast({ title: 'Reminder added' });
        queryClient.invalidateQueries();
        onClose();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader className="mb-6">
        <DialogTitle>Add Reminder</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input required value={formData.title} onChange={e => setFormData(p => ({...p, title: e.target.value}))} placeholder="e.g. Internet Bill" />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={formData.type} onValueChange={v => setFormData(p => ({...p, type: v as any}))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bills">Bills</SelectItem>
              <SelectItem value="rent">Rent</SelectItem>
              <SelectItem value="emi">EMI / Loan</SelectItem>
              <SelectItem value="investment">Investment</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input type="date" required value={formData.dueDate} onChange={e => setFormData(p => ({...p, dueDate: e.target.value}))} />
          </div>
          <div className="space-y-2">
            <Label>Amount (Optional)</Label>
            <Input type="number" value={formData.amount} onChange={e => setFormData(p => ({...p, amount: e.target.value}))} />
          </div>
        </div>
      </div>
      <div className="mt-8 flex justify-end gap-3">
        <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={createReminder.isPending}>Save Reminder</Button>
      </div>
    </form>
  );
}
