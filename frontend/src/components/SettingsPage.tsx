import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import ProviderManager from './ProviderManager';
import type { AppSettings } from '@/types';

export default function SettingsPage() {
    const { settings, setSettings } = useAppStore();
    const [activeTab, setActiveTab] = useState<'api' | 'global'>('api');

    if (!settings) return null;

    const handleGlobalPromptChange = (value: string) => {
        const updated: AppSettings = { ...settings, globalSystemPrompt: value };
        setSettings(updated);
    };

    const TABS = [
        { id: 'api' as const, label: 'Providers' },
        { id: 'global' as const, label: 'Global' },
    ];

    return (
        <div style={{ minHeight: '100%', background: '#07050c', padding: '24px 16px' }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontFamily: "'Instrument Serif', Georgia, serif", color: '#ffffff', fontWeight: 400 }}>
                    Settings
                </h2>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4 }}>
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            flex: 1,
                            padding: '8px 16px',
                            borderRadius: 8,
                            border: 'none',
                            cursor: 'pointer',
                            background: activeTab === tab.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: activeTab === tab.id ? '#ffffff' : 'rgba(255,255,255,0.4)',
                            fontSize: 12,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            fontFamily: "'Courier New', monospace",
                            transition: 'all 0.15s',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'api' && <ProviderManager />}

            {activeTab === 'global' && (
                <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace", marginBottom: 8 }}>
                        Global System Prompt
                    </label>
                    <textarea
                        value={settings.globalSystemPrompt}
                        onChange={e => handleGlobalPromptChange(e.target.value)}
                        placeholder="Applied to all personas before their individual prompt…"
                        rows={10}
                        style={{
                            width: '100%',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 12,
                            padding: '12px 14px',
                            color: '#e8e0d4',
                            fontSize: 13,
                            fontFamily: "'Lora', Georgia, serif",
                            lineHeight: 1.65,
                            resize: 'vertical',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                    />
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
                        This prompt is prepended to every persona's system prompt on each request.
                    </p>
                </div>
            )}
        </div>
    );
}
