import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useListBudgets, useCreateBudget, useUpdateBudget, useDeleteBudget, Budget } from '@workspace/api-client-react';
import { Plus, Target, PieChart, AlertCircle, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { customFetch } from '@workspace/api-client-react/custom-fetch';

type BudgetAccount = { id: number; name: string; currency: string };

export default function Budgets() {
  const { data: budgetsData, isLoading } = useListBudgets();
  const budgets = (Array.isArray(budgetsData) ? budgetsData : []) as Budget[];
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteBudget = useDeleteBudget();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

  const handleDelete = (id: number) => {
    if (!confirm('Delete this budget?')) return;
    deleteBudget.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Budget deleted' });
        queryClient.invalidateQueries();
      }
    });
  };


  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Budgets</h1>
          <p className="text-muted-foreground mt-1">Control your spending and set limits.</p>
        </div>
        <Button onClick={() => { setEditingBudget(null); setIsFormOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> New Budget
        </Button>
      </div>

      {budgets.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><PieChart className="mt-0.5 h-4 w-4 shrink-0 text-primary"/><p className="text-muted-foreground">Each limit is tracked within its own period and category. A purchase can count toward more than one relevant limit, so the cards below show each budget separately.</p></div>
      )}

      {isLoading ? (
        <div className="p-12 flex justify-center text-muted-foreground">Loading budgets...</div>
      ) : budgets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgets.map(budget => {
            const unresolvedCurrency = !(budget as any).currency && budget.spent == null;
            const spent = Number(budget.spent ?? 0);
            const usagePercent = (spent / budget.amount) * 100;
            const isWarning = usagePercent >= (budget.alertThreshold || 80);
            const isOver = usagePercent > 100;
            
            return (
              <div key={budget.id} className="glass-card rounded-2xl p-6 relative overflow-hidden group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Target className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{budget.name}</h3>
                      <div className="text-xs text-muted-foreground">{budget.period} • {budget.category || 'All Categories'}{(budget as any).currency ? ` · ${(budget as any).currency}` : ''}</div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditingBudget(budget); setIsFormOpen(true); }}>
                        <Edit className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(budget.id)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <div className="flex justify-between items-end mb-2 mt-6">
                  <div className="text-2xl font-mono font-medium">{unresolvedCurrency ? 'Choose a currency' : formatCurrency(spent, (budget as any).currency || 'INR')}</div>
                  <div className="text-sm text-muted-foreground">Limit: {formatCurrency(budget.amount, (budget as any).currency || 'INR')}</div>
                </div>

                {unresolvedCurrency ? <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3"><p className="text-xs text-amber-400">This budget had no currency selected. Activity spans multiple currencies, so totals and warnings are paused until you choose one.</p><div className="mt-2 flex flex-wrap gap-2">{((budget as any).spentByCurrency ?? []).map((item: { currency: string; amount: number }) => <span key={item.currency} className="rounded-full bg-muted px-2 py-1 text-[10px]">{formatCurrency(item.amount, item.currency)}</span>)}</div><Button size="sm" variant="outline" className="mt-3" onClick={() => { setEditingBudget(budget); setIsFormOpen(true); }}>Choose currency</Button></div> : <>
                
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-2">
                  <div 
                    className={`h-full transition-all ${isOver ? 'bg-destructive' : isWarning ? 'bg-amber-400' : 'bg-primary'}`}
                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  />
                </div>
                
                <div className="flex justify-between text-xs">
                  <span className={isOver ? 'text-destructive font-medium' : isWarning ? 'text-amber-400 font-medium' : 'text-muted-foreground'}>
                    {usagePercent.toFixed(1)}% used
                  </span>
                  <span className="text-muted-foreground">
                    {budget.amount - spent > 0 ? `${formatCurrency(budget.amount - spent, (budget as any).currency || 'INR')} left` : 'Over budget'}
                  </span>
                </div>
                {isOver && <p role="status" className="mt-3 flex items-center gap-2 text-xs font-medium text-destructive"><AlertCircle className="h-3.5 w-3.5" />Limit exceeded by {formatCurrency(spent - budget.amount, (budget as any).currency || 'INR')}</p>}
                {isWarning && !isOver && <p role="status" className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-400"><AlertCircle className="h-3.5 w-3.5" />You're approaching this spending limit.</p>}
                </>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-16 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <PieChart className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-display font-medium text-foreground">No budgets set</h3>
          <p className="text-muted-foreground mt-2 mb-6 max-w-sm">
            Setting limits helps you save more. Create your first budget to start tracking.
          </p>
          <Button onClick={() => { setEditingBudget(null); setIsFormOpen(true); }}>Create Budget</Button>
        </div>
      )}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <BudgetForm 
            budget={editingBudget} 
            onClose={() => { setIsFormOpen(false); setEditingBudget(null); }} 
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BudgetForm({ budget, onClose }: { budget: Budget | null, onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => customFetch<BudgetAccount[]>('/api/accounts', { responseType: 'json' }) });

  const [formData, setFormData] = useState({
    name: budget?.name || '',
    amount: budget?.amount?.toString() || '',
    period: budget?.period || 'monthly',
    category: budget?.category || '',
    currency: (budget as any)?.currency || '',
    alertThreshold: budget?.alertThreshold?.toString() || '80'
  });
  const currencyOptions = [...new Set([...(accounts.data ?? []).map(account => account.currency), formData.currency, 'INR'].filter(Boolean))];
  useEffect(() => { if (!formData.currency && accounts.data?.length) setFormData(current => ({ ...current, currency: accounts.data?.[0]?.currency ?? 'INR' })); }, [accounts.data, formData.currency]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.amount || !formData.currency) return;

    const payload = {
      ...formData,
      amount: parseFloat(formData.amount),
      alertThreshold: parseInt(formData.alertThreshold)
    };

    if (budget) {
      updateBudget.mutate({ id: budget.id, data: payload as any }, {
        onSuccess: () => {
          toast({ title: 'Budget updated' });
          queryClient.invalidateQueries();
          onClose();
        }
      });
    } else {
      createBudget.mutate({ data: payload as any }, {
        onSuccess: () => {
          toast({ title: 'Budget created' });
          queryClient.invalidateQueries();
          onClose();
        }
      });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader className="mb-6">
        <DialogTitle>{budget ? 'Edit Budget' : 'Create Budget'}</DialogTitle>
      </DialogHeader>
      
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Budget Name</Label>
          <Input required value={formData.name} onChange={e => setFormData(p => ({...p, name: e.target.value}))} placeholder="e.g. Groceries" />
        </div>
        
        <div className="space-y-2">
          <Label>Amount Limit</Label>
          <Input type="number" required min="1" value={formData.amount} onChange={e => setFormData(p => ({...p, amount: e.target.value}))} />
        </div>

        <div className="space-y-2"><Label>Currency</Label><Select value={formData.currency} onValueChange={currency => setFormData(p => ({ ...p, currency }))}><SelectTrigger><SelectValue placeholder="Choose currency" /></SelectTrigger><SelectContent>{currencyOptions.map(currency => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Only transactions in this currency count toward this limit.</p></div>
        
        <div className="space-y-2">
          <Label>Period</Label>
          <Select value={formData.period} onValueChange={v => setFormData(p => ({...p, period: v as typeof formData.period}))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Expense Category</Label>
          <Input value={formData.category} onChange={e => setFormData(p => ({...p, category: e.target.value}))} placeholder="e.g. Snack" />
          <p className="text-xs text-muted-foreground">Only expenses in this category count toward the limit. Leave blank for all expenses.</p>
        </div>
        
        <div className="space-y-2">
          <Label>Alert Threshold (%)</Label>
          <Input type="number" min="1" max="100" value={formData.alertThreshold} onChange={e => setFormData(p => ({...p, alertThreshold: e.target.value}))} />
        </div>
      </div>
      
      <div className="mt-8 flex justify-end gap-3">
        <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={createBudget.isPending || updateBudget.isPending}>Save Budget</Button>
      </div>
    </form>
  );
}
