import type { ReactNode } from 'react';
import BottomNav from './BottomNav';

interface Props {
    children: ReactNode;
}

export default function AppShell({ children }: Props) {
    return (
        <div className="flex flex-col h-full bg-[#07050c] text-[#e8e0d4] overflow-hidden">
            {/* Main content area — scrollable, above bottom nav */}
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
                {children}
            </main>

            {/* Bottom navigation */}
            <BottomNav />
        </div>
    );
}
