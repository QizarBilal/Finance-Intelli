import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";
import { useGetExpenseHeatmap } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Fake query params for the hook if needed
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  
  // We'll use the heatmap endpoint to get daily aggregates
  const { data: heatmap } = useGetExpenseHeatmap({ year, month });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get padding days for the calendar grid
  const startDay = monthStart.getDay(); // 0 is Sunday
  const paddingDays = Array.from({ length: startDay === 0 ? 6 : startDay - 1 }).map((_, i) => i);

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  // Map heatmap data by date string for easy lookup
  const dayDataMap = heatmap?.reduce((acc, day) => {
    acc[day.date.split('T')[0]] = day; // assuming ISO date format
    return acc;
  }, {} as Record<string, any>) || {};

  return (
    <Layout>
      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
            <p className="text-muted-foreground mt-1">Daily financial snapshot</p>
          </div>
          <div className="flex items-center gap-4 bg-white/5 rounded-lg p-1 border border-white/10">
            <button onClick={prevMonth} className="p-2 hover:bg-white/10 rounded-md transition-colors"><ChevronLeft size={20} /></button>
            <span className="font-semibold w-32 text-center">{format(currentDate, "MMMM yyyy")}</span>
            <button onClick={nextMonth} className="p-2 hover:bg-white/10 rounded-md transition-colors"><ChevronRight size={20} /></button>
          </div>
        </div>

        <Card className="glass-card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-white/10 text-center py-3 bg-white/5">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-[120px] bg-white/5 gap-[1px]">
            {paddingDays.map(i => (
              <div key={`pad-${i}`} className="bg-[#0d0d0f] opacity-50" />
            ))}
            
            {daysInMonth.map(day => {
              const dateStr = format(day, "yyyy-MM-dd");
              const data = dayDataMap[dateStr];
              const isToday = isSameDay(day, new Date());

              return (
                <div 
                  key={day.toISOString()} 
                  className={`bg-[#0d0d0f] p-2 transition-colors hover:bg-white/[0.02] cursor-pointer relative group`}
                >
                  <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-primary text-white' : 'text-muted-foreground group-hover:text-white'
                  }`}>
                    {format(day, "d")}
                  </span>

                  {data && data.amount > 0 && (
                    <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-1">
                      <div className="w-full h-1.5 rounded-full bg-rose-500/20 overflow-hidden">
                        <div className="h-full bg-rose-500" style={{ width: `${Math.min((data.amount / 5000) * 100, 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground leading-none">₹{data.amount.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </Layout>
  );
}