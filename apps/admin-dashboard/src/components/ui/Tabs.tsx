import { createContext, useContext, type ReactNode } from 'react';

interface TabsContextValue {
  active: string;
  onChange: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps {
  active: string;
  onChange: (id: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ active, onChange, children, className = '' }: TabsProps) {
  return (
    <TabsContext.Provider value={{ active, onChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabListProps {
  children: ReactNode;
  className?: string;
}

export function TabList({ children, className = '' }: TabListProps) {
  return (
    <div className={['flex border-b border-[#E8E0D8] overflow-x-auto', className].join(' ')}>
      {children}
    </div>
  );
}

interface TabProps {
  id: string;
  children: ReactNode;
}

export function Tab({ id, children }: TabProps) {
  const ctx = useContext(TabsContext)!;
  const isActive = ctx.active === id;
  return (
    <button
      onClick={() => ctx.onChange(id)}
      className={[
        'px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors',
        isActive
          ? 'border-[#D4813A] text-[#D4813A]'
          : 'border-transparent text-[#9C8E7E] hover:text-[#1C1408] hover:border-[#E8E0D8]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

interface TabPanelProps {
  id: string;
  children: ReactNode;
}

export function TabPanel({ id, children }: TabPanelProps) {
  const ctx = useContext(TabsContext)!;
  if (ctx.active !== id) return null;
  return <div className="animate-fade-in">{children}</div>;
}
