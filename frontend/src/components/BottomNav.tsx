import { useLocation, useNavigate } from 'react-router';

const NAV_ITEMS = [
    { path: '/', icon: '✦', label: 'Home' },
    { path: '/history', icon: '◎', label: 'History' },
    { path: '/settings', icon: '⟡', label: 'Settings' },
] as const;

export default function BottomNav() {
    const location = useLocation();
    const navigate = useNavigate();

    // Determine active tab — /chat/* counts as home
    const active = location.pathname.startsWith('/chat')
        ? '/'
        : NAV_ITEMS.find(item => location.pathname === item.path)?.path ?? '/';

    return (
        <nav
            className="flex-shrink-0 flex items-center justify-around border-t border-[rgba(255,255,255,0.06)] bg-[rgba(7,5,12,0.92)]"
            style={{
                paddingBottom: 'env(safe-area-inset-bottom)',
                backdropFilter: 'blur(20px)',
                height: 'calc(56px + env(safe-area-inset-bottom))',
            }}
        >
            {NAV_ITEMS.map(item => {
                const isActive = active === item.path;
                return (
                    <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className="flex flex-col items-center gap-1 py-2 px-6 min-w-[44px] min-h-[44px] transition-opacity"
                        style={{ opacity: isActive ? 1 : 0.35 }}
                        aria-label={item.label}
                    >
                        <span
                            className="text-base"
                            style={{ color: isActive ? '#C9A96E' : '#ffffff' }}
                        >
                            {item.icon}
                        </span>
                        <span
                            className="text-[9px] tracking-widest uppercase font-mono"
                            style={{ color: isActive ? '#C9A96E' : 'rgba(255,255,255,0.4)' }}
                        >
                            {item.label}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}
