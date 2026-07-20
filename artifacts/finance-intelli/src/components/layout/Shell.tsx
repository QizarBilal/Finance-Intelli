import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { motion } from 'framer-motion';

interface ShellProps { children: ReactNode; }

export default function Shell({ children }: ShellProps) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 md:pl-64 relative overflow-hidden">
        {/* Subtle ambient gradient top-right */}
        <div className="pointer-events-none fixed top-0 right-0 w-[600px] h-[600px] translate-x-1/3 -translate-y-1/3 bg-primary/[0.04] rounded-full blur-[120px]" />
        {/* Bottom-left counterbalance */}
        <div className="pointer-events-none fixed bottom-0 left-64 w-[400px] h-[400px] translate-y-1/3 bg-primary/[0.025] rounded-full blur-[100px]" />

        <div className="flex-1 overflow-y-auto relative z-10 p-5 md:p-8 lg:p-10 pb-24 md:pb-10">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="mx-auto max-w-6xl w-full"
          >
            {children}
          </motion.div>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
