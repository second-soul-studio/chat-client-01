import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import ProviderManager from './ProviderManager';
import ToolsSettings from './ToolsSettings';
import type { AppSettings, MemorySettings } from '@/types';

export default function SettingsPage() {
    const { settings, setSettings, modelConfigs, providers } = useAppStore();
    const [activeTab, setActiveTab] = useState<'api' | 'global' | 'tools' | 'memory'>('api');

    if (!settings) return null;

    const handleGlobalPromptChange = (value: string) => {
        const updated: AppSettings = { ...settings, globalSystemPrompt: value };
        setSettings(updated);
    };

    const updateMemory = (patch: Partial<MemorySettings>) => {
        const updated: AppSettings = {
            ...settings,
            memorySettings: { ...settings.memorySettings, ...patch },
        };
        setSettings(updated);
    };

    // Group models by provider for the worker model dropdown
    const providerGroups = providers.filter(p => p.enabled).map(p => ({
        provider: p,
        models: modelConfigs.filter(m => m.providerId === p.id),
    })).filter(g => g.models.length > 0);

    const TABS = [
        { id: 'api' as const, label: 'Providers' },
        { id: 'global' as const, label: 'Global' },
        { id: 'tools' as const, label: 'Tools' },
        { id: 'memory' as const, label: 'Memory' },
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

            {activeTab === 'tools' && <ToolsSettings />}

            {activeTab === 'memory' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Worker Model */}
                    <div>
                        <label style={labelStyle}>Worker Model</label>
                        <select
                            value={settings.memorySettings.workerModelId ?? ''}
                            onChange={e => updateMemory({ workerModelId: e.target.value || null })}
                            style={{
                                width: '100%', background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                                padding: '10px 12px', color: '#e8e0d4', fontSize: 13,
                                fontFamily: "'Lora', Georgia, serif", outline: 'none',
                                appearance: 'none', cursor: 'pointer',
                            }}
                        >
                            <option value="" style={{ background: '#1a1520' }}>Use Chat Model (default)</option>
                            {providerGroups.map(g => (
                                <optgroup key={g.provider.id} label={g.provider.name} style={{ background: '#1a1520' }}>
                                    {g.models.map(m => (
                                        <option key={m.id} value={m.id} style={{ background: '#1a1520' }}>
                                            {m.displayName}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <p style={hintStyle}>Model used for memory detection and consolidation.</p>
                    </div>

                    {/* Detection Interval */}
                    <div>
                        <label style={labelStyle}>Detection Interval</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <input
                                type="range"
                                min={3} max={10} step={1}
                                value={settings.memorySettings.detectionInterval}
                                onChange={e => updateMemory({ detectionInterval: Number(e.target.value) })}
                                style={{ flex: 1, accentColor: '#a78bfa' }}
                            />
                            <span style={valueStyle}>{settings.memorySettings.detectionInterval} turns</span>
                        </div>
                        <p style={hintStyle}>Check for new memories every N assistant replies.</p>
                    </div>

                    {/* Auto-Consolidate */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <div>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>Auto-Consolidate</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                                Automatically merge pending entries into topics
                            </div>
                        </div>
                        <button
                            onClick={() => updateMemory({ autoConsolidate: !settings.memorySettings.autoConsolidate })}
                            style={{
                                width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                                background: settings.memorySettings.autoConsolidate ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.1)',
                                position: 'relative', transition: 'background 0.2s',
                            }}
                        >
                            <div style={{
                                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                                position: 'absolute', top: 3,
                                left: settings.memorySettings.autoConsolidate ? 21 : 3,
                                transition: 'left 0.2s',
                            }} />
                        </button>
                    </div>

                    {/* Consolidation Threshold */}
                    <div>
                        <label style={labelStyle}>Consolidation Threshold</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <input
                                type="range"
                                min={5} max={25} step={1}
                                value={settings.memorySettings.consolidationThreshold}
                                onChange={e => updateMemory({ consolidationThreshold: Number(e.target.value) })}
                                style={{ flex: 1, accentColor: '#a78bfa' }}
                            />
                            <span style={valueStyle}>{settings.memorySettings.consolidationThreshold} entries</span>
                        </div>
                        <p style={hintStyle}>
                            {settings.memorySettings.autoConsolidate
                                ? 'Auto-consolidation triggers when pending entries reach this count.'
                                : 'Enable auto-consolidate to use this threshold.'}
                        </p>
                    </div>

                    {/* Suggested Entry Expiry */}
                    <div>
                        <label style={labelStyle}>Suggested Entry Expiry</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <input
                                type="range"
                                min={3} max={30} step={1}
                                value={settings.memorySettings.suggestedEntryExpiryDays}
                                onChange={e => updateMemory({ suggestedEntryExpiryDays: Number(e.target.value) })}
                                style={{ flex: 1, accentColor: '#a78bfa' }}
                            />
                            <span style={valueStyle}>{settings.memorySettings.suggestedEntryExpiryDays} days</span>
                        </div>
                        <p style={hintStyle}>Unreviewed suggestions are automatically deleted after this many days.</p>
                    </div>
                </div>
            )}
        </div>
    );
}

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)',
    letterSpacing: '0.15em', textTransform: 'uppercase',
    fontFamily: "'Courier New', monospace", marginBottom: 8,
};

const hintStyle: React.CSSProperties = {
    fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 6, marginBottom: 0,
};

const valueStyle: React.CSSProperties = {
    fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: "'Courier New', monospace",
    minWidth: 70, textAlign: 'right',
};
