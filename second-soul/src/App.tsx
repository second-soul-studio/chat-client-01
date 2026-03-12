import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { useAppStore } from '@/stores/appStore';
import AppShell from '@/components/AppShell';
import PersonasPage from '@/components/PersonasPage';
import ChatPage from '@/components/ChatPage';
import HistoryPage from '@/components/HistoryPage';
import SettingsPage from '@/components/SettingsPage';

export default function App() {
    const { init, initialised } = useAppStore();

    useEffect(() => {
        init();
    }, [init]);

    if (!initialised) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#07050c]">
                <div className="text-[rgba(255,255,255,0.3)] font-mono text-xs tracking-widest uppercase">
                    loading…
                </div>
            </div>
        );
    }

    return (
        <AppShell>
            <Routes>
                <Route path="/" element={<PersonasPage />} />
                <Route path="/chat/:personaId" element={<ChatPage />} />
                <Route path="/chat/:personaId/:chatId" element={<ChatPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </AppShell>
    );
}
