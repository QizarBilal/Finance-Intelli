import { useState } from 'react';
import { useListGoals, useCreateGoal, useUpdateGoal, useDeleteGoal, useContributeToGoal, Goal } from '@workspace/api-client-react';
import { DatePicker } from '@/components/ui/date-picker';
import { Plus, Target, Trophy, TrendingUp, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function Goals() {
  const { data: goalsData, isLoading } = useListGoals();
  const goals = (Array.isArray(goalsData) ? goalsData : []) as Goal[];
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteGoal = useDeleteGoal();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  
  const [isContributeOpen, setIsContributeOpen] = useState(false);
  const [activeGoalId, setActiveGoalId] = useState<number | null>(null);

  const handleDelete = (id: number) => {
    if (!confirm('Delete this goal?')) return;
    deleteGoal.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Goal deleted' });
        queryClient.invalidateQueries();
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Financial Goals</h1>
          <p className="text-muted-foreground mt-1">Track your progress towards big purchases and milestones.</p>
        </div>
        <Button onClick={() => { setEditingGoal(null); setIsFormOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> New Goal
        </Button>
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center text-muted-foreground">Loading goals...</div>
      ) : goals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map(goal => {
            const progress = (goal.currentAmount / goal.targetAmount) * 100;
            const isCompleted = progress >= 100;
            
            return (
              <div key={goal.id} className="glass-card rounded-2xl p-6 relative overflow-hidden group border-t-[4px]" style={{ borderTopColor: goal.color || 'hsl(var(--primary))' }}>
                {isCompleted && (
                  <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-widest">
                    Achieved
                  </div>
                )}
                
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="font-display text-xl font-bold">{goal.name}</h3>
                    {goal.deadline && <div className="text-xs text-muted-foreground mt-1">Target: {formatDate(goal.deadline)}</div>}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditingGoal(goal); setIsFormOpen(true); }}>
                        <Edit className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(goal.id)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <div className="flex justify-center mb-6">
                  {/* Custom CSS Circle Progress */}
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-muted/30" />
                      <circle 
                        cx="64" cy="64" r="56" 
                        stroke={goal.color || 'hsl(var(--primary))'} 
                        strokeWidth="8" fill="transparent" 
                        strokeDasharray={351.8} 
                        strokeDashoffset={351.8 - (351.8 * Math.min(progress, 100)) / 100}
                        className="transition-all duration-1000 ease-out"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-display font-bold">{Math.min(Math.round(progress), 100)}%</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-center space-y-1 mb-6">
                  <div className="text-xl font-mono font-medium">{formatCurrency(goal.currentAmount)}</div>
                  <div className="text-sm text-muted-foreground">of {formatCurrency(goal.targetAmount)}</div>
                </div>
                
                {!isCompleted && (
                  <Button 
                    className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80" 
                    onClick={() => { setActiveGoalId(goal.id); setIsContributeOpen(true); }}
                  >
                    Add Funds
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-16 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Trophy className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-display font-medium text-foreground">No goals yet</h3>
          <p className="text-muted-foreground mt-2 mb-6 max-w-sm">
            Whether it's a vacation or a house deposit, setting a goal helps make it reality.
          </p>
          <Button onClick={() => { setEditingGoal(null); setIsFormOpen(true); }}>Set First Goal</Button>
        </div>
      )}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <GoalForm 
            goal={editingGoal} 
            onClose={() => { setIsFormOpen(false); setEditingGoal(null); }} 
          />
        </DialogContent>
      </Dialog>
      
      <Dialog open={isContributeOpen} onOpenChange={setIsContributeOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <ContributeForm 
            goalId={activeGoalId} 
            onClose={() => { setIsContributeOpen(false); setActiveGoalId(null); }} 
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GoalForm({ goal, onClose }: { goal: Goal | null, onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();

  const [formData, setFormData] = useState({
    name: goal?.name || '',
    targetAmount: goal?.targetAmount?.toString() || '',
    currentAmount: goal?.currentAmount?.toString() || '0',
    deadline: goal?.deadline || '',
    color: goal?.color || '#10b981'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.targetAmount) return;

    const payload = {
      ...formData,
      targetAmount: parseFloat(formData.targetAmount),
      currentAmount: parseFloat(formData.currentAmount)
    };

    if (goal) {
      updateGoal.mutate({ id: goal.id, data: payload as any }, {
        onSuccess: () => {
          toast({ title: 'Goal updated' });
          queryClient.invalidateQueries();
          onClose();
        }
      });
    } else {
      createGoal.mutate({ data: payload as any }, {
        onSuccess: () => {
          toast({ title: 'Goal created' });
          queryClient.invalidateQueries();
          onClose();
        }
      });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader className="mb-6">
        <DialogTitle>{goal ? 'Edit Goal' : 'Create Goal'}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Goal Name</Label>
          <Input required value={formData.name} onChange={e => setFormData(p => ({...p, name: e.target.value}))} placeholder="e.g. Dream Vacation" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Target Amount</Label>
            <Input type="number" required value={formData.targetAmount} onChange={e => setFormData(p => ({...p, targetAmount: e.target.value}))} />
          </div>
          <div className="space-y-2">
            <Label>Already Saved</Label>
            <Input type="number" required value={formData.currentAmount} onChange={e => setFormData(p => ({...p, currentAmount: e.target.value}))} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Target Date (Optional)</Label>
          <DatePicker
            value={formData.deadline}
            onChange={val => setFormData(p => ({...p, deadline: val}))}
            placeholder="No deadline"
          />
        </div>
        <div className="space-y-2">
          <Label>Theme Color</Label>
          <Input type="color" value={formData.color} onChange={e => setFormData(p => ({...p, color: e.target.value}))} className="h-10 p-1 w-full" />
        </div>
      </div>
      <div className="mt-8 flex justify-end gap-3">
        <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={createGoal.isPending || updateGoal.isPending}>Save Goal</Button>
      </div>
    </form>
  );
}

function ContributeForm({ goalId, onClose }: { goalId: number | null, onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const contribute = useContributeToGoal();
  const [amount, setAmount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalId || !amount) return;

    contribute.mutate({ id: goalId, data: { amount: parseFloat(amount) } }, {
      onSuccess: (res: any) => {
        toast({ title: 'Contribution added successfully' });
        if (res.isCompleted) {
          toast({ title: 'Goal achieved!', description: 'Congratulations on reaching your goal.' });
        }
        queryClient.invalidateQueries();
        onClose();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader className="mb-6">
        <DialogTitle>Add Funds</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Amount to add</Label>
          <Input type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} autoFocus placeholder="0.00" className="text-2xl h-14 font-mono" />
        </div>
      </div>
      <div className="mt-8 flex justify-end gap-3">
        <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={contribute.isPending}>Add Contribution</Button>
      </div>
    </form>
  );
}
