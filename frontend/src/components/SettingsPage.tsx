import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import ProviderManager from './ProviderManager';
import ToolsSettings from './ToolsSettings';
import type { AppSettings, KnowledgeSettings, MemorySettings } from '@/types';
import { DEFAULT_KNOWLEDGE_SETTINGS } from '@/services/db';

export default function SettingsPage() {
    const { settings, setSettings, modelConfigs, providers } = useAppStore();
    const [activeTab, setActiveTab] = useState<'api' | 'global' | 'display' | 'tools' | 'memory' | 'knowledge'>('api');

    if (!settings) return null;

    const handleGlobalPromptChange = (value: string) => {
        const updated: AppSettings = { ...settings, globalSystemPrompt: value };
        setSettings(updated);
    };

    const updateKnowledge = (patch: Partial<KnowledgeSettings>) => {
        const updated: AppSettings = {
            ...settings,
            knowledge: { ...settings.knowledge, ...patch },
        };
        setSettings(updated);
    };

    const resetKnowledgeDefaults = () => {
        setSettings({ ...settings, knowledge: { ...DEFAULT_KNOWLEDGE_SETTINGS } });
    };

    const updateDisplay = (patch: Partial<Pick<AppSettings, 'chatFontSize' | 'uiScale' | 'chatFontFamily' | 'chatLineHeight'>>) => {
        setSettings({ ...settings, ...patch });
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
        { id: 'display' as const, label: 'Display' },
        { id: 'tools' as const, label: 'Tools' },
        { id: 'memory' as const, label: 'Memory' },
        { id: 'knowledge' as const, label: 'Knowledge' },
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

            {activeTab === 'display' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                    {/* Chat Font Size */}
                    <div>
                        <label style={labelStyle}>Chat Font Size</label>
                        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4 }}>
                            {(['normal', 'large', 'very-large'] as const).map(size => (
                                <button
                                    key={size}
                                    onClick={() => updateDisplay({ chatFontSize: size })}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: settings.chatFontSize === size ? 'rgba(255,255,255,0.1)' : 'transparent',
                                        color: settings.chatFontSize === size ? '#ffffff' : 'rgba(255,255,255,0.4)',
                                        fontSize: 12,
                                        letterSpacing: '0.08em',
                                        fontFamily: "'Courier New', monospace",
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {size === 'normal' ? 'Normal' : size === 'large' ? 'Large' : 'Very Large'}
                                </button>
                            ))}
                        </div>
                        <p style={hintStyle}>Applies to chat message text only.</p>
                    </div>

                    {/* UI Scale */}
                    <div>
                        <label style={labelStyle}>UI Scale</label>
                        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4 }}>
                            {([100, 110, 120, 130] as const).map(scale => (
                                <button
                                    key={scale}
                                    onClick={() => updateDisplay({ uiScale: scale })}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: settings.uiScale === scale ? 'rgba(255,255,255,0.1)' : 'transparent',
                                        color: settings.uiScale === scale ? '#ffffff' : 'rgba(255,255,255,0.4)',
                                        fontSize: 12,
                                        letterSpacing: '0.08em',
                                        fontFamily: "'Courier New', monospace",
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {scale}%
                                </button>
                            ))}
                        </div>
                        <p style={hintStyle}>Scales the entire UI. Applies immediately.</p>
                    </div>

                    {/* Font Family */}
                    <div>
                        <label style={labelStyle}>Chat Font</label>
                        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4 }}>
                            {(['serif', 'sans-serif'] as const).map(family => (
                                <button
                                    key={family}
                                    onClick={() => updateDisplay({ chatFontFamily: family })}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: (settings.chatFontFamily ?? 'serif') === family ? 'rgba(255,255,255,0.1)' : 'transparent',
                                        color: (settings.chatFontFamily ?? 'serif') === family ? '#ffffff' : 'rgba(255,255,255,0.4)',
                                        fontSize: 12,
                                        letterSpacing: '0.08em',
                                        fontFamily: "'Courier New', monospace",
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {family === 'serif' ? 'Serif' : 'Sans-Serif'}
                                </button>
                            ))}
                        </div>
                        <p style={hintStyle}>Applies to chat messages and the input box.</p>
                    </div>

                    {/* Line Height */}
                    <div>
                        <label style={labelStyle}>Line Spacing</label>
                        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4 }}>
                            {(['small', 'normal', 'large', 'very-large'] as const).map(lh => (
                                <button
                                    key={lh}
                                    onClick={() => updateDisplay({ chatLineHeight: lh })}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: (settings.chatLineHeight ?? 'normal') === lh ? 'rgba(255,255,255,0.1)' : 'transparent',
                                        color: (settings.chatLineHeight ?? 'normal') === lh ? '#ffffff' : 'rgba(255,255,255,0.4)',
                                        fontSize: 12,
                                        letterSpacing: '0.08em',
                                        fontFamily: "'Courier New', monospace",
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {lh === 'normal' ? 'Normal' : lh === 'very-large' ? 'XL' : lh.charAt(0).toUpperCase() + lh.slice(1)}
                                </button>
                            ))}
                        </div>
                        <p style={hintStyle}>Applies to chat messages only. Small = 1.5, Normal = 1.65, Large = 1.9, XL = 2.1.</p>
                    </div>
                </div>
            )}

            {activeTab === 'tools' && <ToolsSettings />}

            {activeTab === 'knowledge' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Default Embedding Provider */}
                    <div>
                        <label style={labelStyle}>Default Embedding Provider</label>
                        <select
                            value={settings.knowledge.defaultEmbeddingProviderId ?? ''}
                            onChange={e => updateKnowledge({ defaultEmbeddingProviderId: e.target.value || undefined })}
                            style={{
                                width: '100%', background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                                padding: '10px 12px', color: '#e8e0d4', fontSize: 13,
                                fontFamily: "'Lora', Georgia, serif", outline: 'none',
                                appearance: 'none', cursor: 'pointer',
                            }}
                        >
                            <option value="" style={{ background: '#1a1520' }}>— none —</option>
                            {providerGroups.map(g => (
                                <option key={g.provider.id} value={g.provider.id} style={{ background: '#1a1520' }}>
                                    {g.provider.name}
                                </option>
                            ))}
                        </select>
                        <p style={hintStyle}>Provider used when creating new collections.</p>
                    </div>

                    {/* Default Embedding Model */}
                    <div>
                        <label style={labelStyle}>Default Embedding Model</label>
                        <input
                            type="text"
                            value={settings.knowledge.defaultEmbeddingModelSlug ?? ''}
                            onChange={e => updateKnowledge({ defaultEmbeddingModelSlug: e.target.value || undefined })}
                            placeholder="e.g. text-embedding-3-small"
                            style={{
                                width: '100%', background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                                padding: '10px 12px', color: '#e8e0d4', fontSize: 13,
                                outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                            }}
                        />
                        <p style={hintStyle}>Model slug used for embedding documents.</p>
                    </div>

                    {/* Default Chunk Size */}
                    <div>
                        <label style={labelStyle}>Default Chunk Size</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <input
                                type="number"
                                min={100} max={8000} step={50}
                                value={settings.knowledge.defaultChunkSize}
                                onChange={e => updateKnowledge({ defaultChunkSize: Number(e.target.value) })}
                                style={{
                                    flex: 1, background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                                    padding: '10px 12px', color: '#e8e0d4', fontSize: 13,
                                    outline: 'none', fontFamily: 'inherit',
                                }}
                            />
                            <span style={valueStyle}>tokens</span>
                        </div>
                        <p style={hintStyle}>Pre-fills when creating a new collection.</p>
                    </div>

                    {/* Default Chunk Overlap */}
                    <div>
                        <label style={labelStyle}>Default Chunk Overlap</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <input
                                type="number"
                                min={0} max={2000} step={10}
                                value={settings.knowledge.defaultChunkOverlap}
                                onChange={e => updateKnowledge({ defaultChunkOverlap: Number(e.target.value) })}
                                style={{
                                    flex: 1, background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                                    padding: '10px 12px', color: '#e8e0d4', fontSize: 13,
                                    outline: 'none', fontFamily: 'inherit',
                                }}
                            />
                            <span style={valueStyle}>tokens</span>
                        </div>
                        <p style={hintStyle}>Overlap between adjacent chunks to preserve context at boundaries.</p>
                    </div>

                    {/* Knowledge Context Token Budget */}
                    <div>
                        <label style={labelStyle}>Knowledge Context Token Budget</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <input
                                type="number"
                                min={500} max={32000} step={500}
                                value={settings.knowledge.knowledgeContextTokenBudget}
                                onChange={e => updateKnowledge({ knowledgeContextTokenBudget: Number(e.target.value) })}
                                style={{
                                    flex: 1, background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                                    padding: '10px 12px', color: '#e8e0d4', fontSize: 13,
                                    outline: 'none', fontFamily: 'inherit',
                                }}
                            />
                            <span style={valueStyle}>tokens</span>
                        </div>
                        <p style={hintStyle}>Maximum tokens reserved for injected knowledge context per chat turn.</p>
                    </div>

                    {/* Top-K Chunks */}
                    <div>
                        <label style={labelStyle}>Top-K Chunks per Query</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <input
                                type="range"
                                min={1} max={20} step={1}
                                value={settings.knowledge.topK}
                                onChange={e => updateKnowledge({ topK: Number(e.target.value) })}
                                style={{ flex: 1, accentColor: '#C9A96E' }}
                            />
                            <span style={valueStyle}>{settings.knowledge.topK} chunks</span>
                        </div>
                        <p style={hintStyle}>Number of most-relevant chunks retrieved per query.</p>
                    </div>

                    {/* RAG Prompt Template */}
                    <div>
                        <label style={labelStyle}>RAG Prompt Template</label>
                        <textarea
                            value={settings.knowledge.ragPromptTemplate}
                            onChange={e => updateKnowledge({ ragPromptTemplate: e.target.value })}
                            rows={6}
                            style={{
                                width: '100%',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 12,
                                padding: '12px 14px',
                                color: '#e8e0d4',
                                fontSize: 12,
                                fontFamily: "'Courier New', monospace",
                                lineHeight: 1.65,
                                resize: 'vertical',
                                outline: 'none',
                                boxSizing: 'border-box',
                            }}
                        />
                        <p style={hintStyle}>
                            {'{{chunks}}'}  is replaced with retrieved source blocks at query time.
                        </p>
                    </div>

                    {/* Reset to defaults */}
                    <div>
                        <button
                            onClick={resetKnowledgeDefaults}
                            style={{
                                padding: '10px 20px',
                                borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'transparent',
                                color: 'rgba(255,255,255,0.45)',
                                fontSize: 11,
                                fontFamily: "'Courier New', monospace",
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            Reset to Defaults
                        </button>
                    </div>
                </div>
            )}

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
