import React, { useState } from "react";
import { useListTransactions } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Search, Filter, Calendar as CalIcon } from "lucide-react";

export function Transactions() {
  const [search, setSearch] = useState("");
  const { data: listData, isLoading } = useListTransactions({ limit: 50, search: search || undefined });

  return (
    <Layout>
      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
            <p className="text-muted-foreground mt-1">Your detailed financial history</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input 
              placeholder="Search descriptions, tags, amounts..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 w-full"
            />
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition-colors">
              <Filter size={16} /> Filters
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition-colors">
              <CalIcon size={16} /> Range
            </button>
          </div>
        </div>

        <Card className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Details</th>
                  <th className="px-6 py-4 font-medium">Category</th>
                  <th className="px-6 py-4 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [1, 2, 3, 4, 5].map(i => (
                    <tr key={i} className="border-b border-white/5 animate-pulse">
                      <td className="px-6 py-4"><div className="h-4 w-20 bg-white/5 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-40 bg-white/5 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-6 w-24 bg-white/5 rounded-full" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-16 bg-white/5 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : listData?.transactions?.length ? (
                  listData.transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                        {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{tx.description || tx.category_name}</div>
                        {tx.payment_method && (
                          <div className="text-xs text-muted-foreground mt-1">{tx.payment_method}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="bg-white/5 border-white/10 gap-1.5 py-1">
                          <span>{tx.category_icon || '📁'}</span>
                          <span>{tx.category_name}</span>
                        </Badge>
                      </td>
                      <td className={`px-6 py-4 text-right font-semibold whitespace-nowrap ${tx.type === 'expense' ? 'text-foreground' : 'text-emerald-500'}`}>
                        {tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                      No transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  );
}