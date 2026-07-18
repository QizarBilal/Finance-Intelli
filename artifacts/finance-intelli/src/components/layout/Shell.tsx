import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { motion } from 'framer-motion';

interface ShellProps {
  children: ReactNode;
}

export default function Shell({ children }: ShellProps) {
  return (
    <div className="flex min-h-screen bg-background text-foreground selection:bg-primary/30">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 md:pl-64 overflow-hidden relative">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
        
        <div className="flex-1 overflow-y-auto z-10 p-4 md:p-8 lg:p-10 pb-24 md:pb-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="mx-auto max-w-6xl w-full h-full"
          >
            {children}
          </motion.div>
        </div>
      </main>
      
      <MobileNav />
    </div>
  );
}
