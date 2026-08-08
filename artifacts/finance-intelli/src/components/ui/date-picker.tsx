import { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

function toDateObj(val: string): Date | undefined {
  if (!val) return undefined;
  const [y, m, d] = val.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplay(val: string): string {
  if (!val) return '';
  const [y, m, d] = val.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

export function DatePicker({ value, onChange, placeholder = 'Pick a date', className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = toDateObj(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'w-full justify-between font-normal bg-background/50 border-border',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span>{value ? formatDisplay(value) : placeholder}</span>
          <CalendarIcon className="w-4 h-4 ml-2 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) {
              onChange(toDateStr(d));
              setOpen(false);
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
