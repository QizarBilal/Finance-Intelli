import { useState, useRef, useEffect } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { useLocation } from 'wouter';
import { 
  useListTransactions, 
  useDeleteTransaction,
  useCreateTransaction,
  useUpdateTransaction,
  useListCategories,
  useCreateCategory,
  Transaction,
  TransactionType
} from '@workspace/api-client-react';
import { 
  Plus, Search, Filter, ArrowUpRight, ArrowDownRight, Wallet, 
  MoreHorizontal, Edit, Trash2, Calendar as CalendarIcon, Tag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function Transactions() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const isNew = searchParams.get('new') === 'true';
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchTerm, setSearchParams] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  
  const { data: transactions, isLoading } = useListTransactions({ 
    search: searchTerm || undefined,
    type: filterType !== 'all' ? filterType as any : undefined,
    limit: 50
  });

  const deleteTx = useDeleteTransaction();

  const [isFormOpen, setIsFormOpen] = useState(isNew);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const handleDelete = (id: number) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    deleteTx.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Transaction deleted' });
        queryClient.invalidateQueries();
      }
    });
  };

  const openEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingTx(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground mt-1">Manage your income, expenses, and transfers.</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Transaction
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search descriptions, categories..." 
            className="pl-9 glass-card border-none bg-card/40"
            value={searchTerm}
            onChange={(e) => setSearchParams(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px] glass-card border-none bg-card/40">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Filter type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="expense">Expenses</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="transfer">Transfers</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : transactions?.data && transactions.data.length > 0 ? (
          <div className="divide-y divide-border/50">
            {transactions.data.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 
                    tx.type === 'expense' ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-500'
                  }`}>
                    {tx.type === 'income' ? <ArrowUpRight className="w-6 h-6" /> : 
                     tx.type === 'expense' ? <ArrowDownRight className="w-6 h-6" /> : <Wallet className="w-6 h-6" />}
                  </div>
                  <div>
                    <div className="font-medium text-foreground text-lg leading-tight">{tx.description || tx.category || 'Transaction'}</div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {formatDate(tx.date)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
                        {tx.category || 'Uncategorized'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className={`font-mono font-bold text-lg text-right ${tx.type === 'income' ? 'text-emerald-400' : 'text-foreground'}`}>
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}{formatCurrency(tx.amount)}
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => openEdit(tx)}>
                        <Edit className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={() => handleDelete(tx.id)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-16 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Wallet className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-display font-medium text-foreground">No transactions found</h3>
            <p className="text-muted-foreground mt-2 mb-6 max-w-sm">
              You haven't recorded any transactions matching your filters.
            </p>
            <Button onClick={() => setIsFormOpen(true)}>Add Transaction</Button>
          </div>
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-border/50 bg-card/95 backdrop-blur-xl">
          <TransactionForm 
            tx={editingTx} 
            onClose={closeForm} 
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TransactionForm({ tx, onClose }: { tx: Transaction | null, onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();
  const createCat = useCreateCategory();
  
  const { data: categoriesData } = useListCategories();
  const categories = categoriesData?.data || [];

  const [formData, setFormData] = useState({
    type: tx?.type || 'expense',
    amount: tx?.amount?.toString() || '',
    date: tx?.date || new Date().toISOString().split('T')[0],
    category: tx?.category || '',
    description: tx?.description || '',
    needOrWant: tx?.needOrWant || 'need',
    notes: tx?.notes || ''
  });

  const [categorySearch, setCategorySearch] = useState('');
  const [isCatOpen, setIsCatOpen] = useState(false);

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(categorySearch.toLowerCase()) && 
    (c.type === formData.type || c.type === 'both')
  );

  const handleCategorySelect = (name: string) => {
    setFormData(p => ({ ...p, category: name }));
    setIsCatOpen(false);
  };

  const handleCategoryCreate = async (name: string) => {
    try {
      await createCat.mutateAsync({ data: { name, type: formData.type as any } });
      queryClient.invalidateQueries();
      setFormData(p => ({ ...p, category: name }));
      setIsCatOpen(false);
    } catch (e) {
      toast({ title: 'Error creating category', variant: 'destructive' });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.date) return;

    const payload = {
      ...formData,
      amount: parseFloat(formData.amount)
    };

    if (tx) {
      updateTx.mutate({ id: tx.id, data: payload as any }, {
        onSuccess: () => {
          toast({ title: 'Transaction updated' });
          queryClient.invalidateQueries();
          onClose();
        }
      });
    } else {
      createTx.mutate({ data: payload as any }, {
        onSuccess: () => {
          toast({ title: 'Transaction added' });
          queryClient.invalidateQueries();
          onClose();
        }
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[85vh]">
      <DialogHeader className="px-6 py-4 border-b border-border/50">
        <DialogTitle className="text-xl font-display">
          {tx ? 'Edit Transaction' : 'New Transaction'}
        </DialogTitle>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        <div className="flex bg-muted/50 p-1 rounded-lg">
          {(['expense', 'income', 'transfer'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFormData(p => ({ ...p, type: t }))}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                formData.type === t 
                  ? t === 'expense' ? 'bg-rose-500 text-white shadow-sm' 
                    : t === 'income' ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-blue-500 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Amount</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-muted-foreground font-display font-medium">₹</span>
              <Input 
                type="number" 
                step="0.01"
                min="0"
                required
                value={formData.amount}
                onChange={e => setFormData(p => ({ ...p, amount: e.target.value }))}
                className="pl-10 h-14 text-2xl font-display font-bold bg-background/50 border-primary/20 focus-visible:ring-primary/30"
                placeholder="0.00"
                autoFocus
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Date</Label>
              <DatePicker
                value={formData.date}
                onChange={val => setFormData(p => ({ ...p, date: val }))}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Category</Label>
              <Popover open={isCatOpen} onOpenChange={setIsCatOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-start font-normal bg-background/50 text-left border-border">
                    <Tag className="w-4 h-4 mr-2 text-muted-foreground" />
                    {formData.category || <span className="text-muted-foreground">Select...</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <div className="p-2 border-b border-border">
                    <Input 
                      placeholder="Type a category..." 
                      value={categorySearch}
                      onChange={e => setCategorySearch(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && categorySearch && filteredCategories.length === 0) {
                          e.preventDefault();
                          handleCategoryCreate(categorySearch);
                        }
                      }}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {filteredCategories.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleCategorySelect(c.name)}
                        className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-secondary transition-colors"
                      >
                        {c.name}
                      </button>
                    ))}
                    {categorySearch && filteredCategories.length === 0 && (
                      <button
                        type="button"
                        onClick={() => handleCategoryCreate(categorySearch)}
                        className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-primary/10 text-primary flex items-center transition-colors"
                      >
                        <Plus className="w-3 h-3 mr-2" /> Create "{categorySearch}"
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Description</Label>
            <Input 
              placeholder="What was this for?" 
              value={formData.description}
              onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
              className="bg-background/50"
            />
          </div>

          {formData.type === 'expense' && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Classification</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="needOrWant" 
                    value="need"
                    checked={formData.needOrWant === 'need'}
                    onChange={() => setFormData(p => ({ ...p, needOrWant: 'need' }))}
                    className="accent-primary"
                  />
                  <span className="text-sm">Need (Essential)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="needOrWant" 
                    value="want"
                    checked={formData.needOrWant === 'want'}
                    onChange={() => setFormData(p => ({ ...p, needOrWant: 'want' }))}
                    className="accent-primary"
                  />
                  <span className="text-sm">Want (Discretionary)</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-border/50 bg-muted/20 flex justify-end gap-3">
        <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={createTx.isPending || updateTx.isPending || !formData.amount || !formData.date}>
          {tx ? 'Save Changes' : 'Record Transaction'}
        </Button>
      </div>
    </form>
  );
}
