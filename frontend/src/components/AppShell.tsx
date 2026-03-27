import { useEffect, type ReactNode } from 'react';
import { useAppStore } from '@/stores/appStore';
import BottomNav from './BottomNav';

interface Props {
    children: ReactNode;
}

const CHAT_FONT_SIZES = {
    normal: '14px',
    large: '16px',
    'very-large': '19px',
} as const;

export default function AppShell({ children }: Props) {
    const settings = useAppStore(s => s.settings);

    useEffect(() => {
        if (!settings) return;
        const fontSize = CHAT_FONT_SIZES[settings.chatFontSize ?? 'normal'];
        const zoom = String((settings.uiScale ?? 100) / 100);
        document.documentElement.style.setProperty('--ss-chat-font-size', fontSize);
        document.documentElement.style.setProperty('--ss-ui-zoom', zoom);
    }, [settings]);

    return (
        <div
            className="flex flex-col h-full bg-[#07050c] text-[#e8e0d4] overflow-hidden"
            style={{ zoom: 'var(--ss-ui-zoom)' }}
        >
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
                {children}
            </main>
            <BottomNav />
        </div>
    );
}
