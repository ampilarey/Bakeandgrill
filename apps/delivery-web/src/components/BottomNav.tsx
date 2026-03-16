import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/',        icon: '🚚', label: 'Active'   },
  { to: '/history', icon: '📋', label: 'History'  },
  { to: '/profile', icon: '👤', label: 'Profile'  },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#EDE4D4] safe-bottom z-50">
      <div className="flex">
        {ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-medium transition-colors ${
                isActive ? 'text-[#D4813A]' : 'text-[#8B7355]'
              }`
            }
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
