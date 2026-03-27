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

const CHAT_FONT_FAMILIES = {
    serif: "'Lora', Georgia, serif",
    'sans-serif': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

const CHAT_LINE_HEIGHTS = {
    small: '1.5',
    normal: '1.65',
    large: '1.9',
    'very-large': '2.1',
} as const;

export default function AppShell({ children }: Props) {
    const settings = useAppStore(s => s.settings);

    useEffect(() => {
        if (!settings) return;
        const fontSize = CHAT_FONT_SIZES[settings.chatFontSize ?? 'normal'];
        const zoom = String((settings.uiScale ?? 100) / 100);
        const fontFamily = CHAT_FONT_FAMILIES[settings.chatFontFamily ?? 'serif'];
        const lineHeight = CHAT_LINE_HEIGHTS[settings.chatLineHeight ?? 'normal'];
        document.documentElement.style.setProperty('--ss-chat-font-size', fontSize);
        // zoom is supported in all modern browsers (Firefox 126+, May 2024)
        document.documentElement.style.setProperty('--ss-ui-zoom', zoom);
        document.documentElement.style.setProperty('--ss-chat-font-family', fontFamily);
        document.documentElement.style.setProperty('--ss-chat-line-height', lineHeight);
    }, [settings]);

    return (
        <div
            className="flex flex-col h-full bg-[#07050c] text-[#e8e0d4] overflow-hidden"
            style={{ zoom: 'var(--ss-ui-zoom, 1)' }}
        >
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
                {children}
            </main>
            <BottomNav />
        </div>
    );
}
