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
    <div
      className={className}
      style={{
        display: 'flex',
        borderBottom: '2px solid #E8E0D8',
        overflowX: 'auto',
        flexWrap: 'nowrap',
        gap: 0,
      }}
    >
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
      style={{
        padding: '10px 20px',
        fontSize: 14,
        fontWeight: isActive ? 700 : 500,
        color: isActive ? '#D4813A' : '#9C8E7E',
        background: 'none',
        border: 'none',
        borderBottom: `2px solid ${isActive ? '#D4813A' : 'transparent'}`,
        marginBottom: -2,
        cursor: 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        transition: 'color 0.15s',
        outline: 'none',
        flexShrink: 0,
      }}
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
