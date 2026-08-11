import type { LucideIcon } from 'lucide-react';
import { Compass } from 'lucide-react';

export interface PurposeItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function PagePurpose({ items }: { items: PurposeItem[] }) {
  return (
    <section className="glass-card rounded-2xl p-5" aria-labelledby="page-purpose-title">
      <div className="mb-4 flex items-center gap-2">
        <Compass className="h-4 w-4 text-primary" />
        <h2 id="page-purpose-title" className="text-sm font-semibold">What this page helps you do</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, description }) => (
          <div key={title} className="rounded-xl border border-border/70 bg-background/35 p-4">
            <Icon className="mb-3 h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
