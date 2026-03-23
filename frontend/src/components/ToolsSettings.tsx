import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import type { ToolConfig, BraveSearchSettings } from '@/types';

const DEFAULT_BRAVE_SETTINGS: BraveSearchSettings = { safesearch: 'moderate' };
const BRAVE_ID = 'brave-search';

export default function ToolsSettings() {
    const { toolConfigs, addToolConfig, updateToolConfig } = useAppStore();
    const braveConfig = toolConfigs.find(c => c.id === BRAVE_ID);

    const [apiKey, setApiKey] = useState(braveConfig?.apiKey ?? '');
    const [enabled, setEnabled] = useState(braveConfig?.enabled ?? false);
    const [settings, setSettings] = useState<BraveSearchSettings>(
        (braveConfig?.settings as unknown as BraveSearchSettings) ?? DEFAULT_BRAVE_SETTINGS,
    );
    const [locationOpen, setLocationOpen] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSave = async () => {
        const config: ToolConfig = {
            id: BRAVE_ID,
            displayName: 'Brave Web Search',
            enabled: enabled && !!apiKey.trim(),
            apiKey: apiKey.trim(),
            settings: settings as unknown as Record<string, unknown>,
        };
        if (braveConfig) {
            await updateToolConfig(config);
        } else {
            await addToolConfig(config);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: '8px 12px',
        color: '#e8e0d4',
        fontSize: 13,
        fontFamily: "'Courier New', monospace",
        outline: 'none',
        boxSizing: 'border-box',
    };

    const labelStyle: React.CSSProperties = {
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        fontFamily: "'Courier New', monospace",
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 6,
        display: 'block',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Brave Web Search */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 15, fontFamily: "'Instrument Serif', Georgia, serif", color: '#fff' }}>Brave Web Search</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Live web search via Brave Search API</div>
                    </div>
                    {/* Enable toggle */}
                    <button
                        onClick={() => setEnabled(v => !v)}
                        style={{
                            width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
                            background: enabled ? '#4ade80' : 'rgba(255,255,255,0.12)',
                            transition: 'background 0.2s',
                        }}
                        aria-label={enabled ? 'Disable' : 'Enable'}
                        title={!apiKey.trim() ? 'Enter an API key to enable' : undefined}
                    >
                        <div style={{
                            position: 'absolute', top: 3, left: enabled ? 21 : 3,
                            width: 16, height: 16, borderRadius: '50%', background: '#fff',
                            transition: 'left 0.2s',
                        }} />
                    </button>
                </div>

                {/* API Key */}
                <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>API Key</label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder="BSA…"
                        style={inputStyle}
                    />
                </div>

                {/* Safesearch */}
                <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Safe Search</label>
                    <select
                        value={settings.safesearch}
                        onChange={e => setSettings(s => ({ ...s, safesearch: e.target.value as BraveSearchSettings['safesearch'] }))}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                        <option value="off">Off</option>
                        <option value="moderate">Moderate (default)</option>
                        <option value="strict">Strict</option>
                    </select>
                </div>

                {/* Location (collapsible) */}
                <div style={{ marginBottom: 14 }}>
                    <button
                        onClick={() => setLocationOpen(v => !v)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...labelStyle, marginBottom: locationOpen ? 10 : 0 }}
                    >
                        Location (optional) {locationOpen ? '▲' : '▼'}
                    </button>
                    {locationOpen && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {([
                                ['lat', 'Latitude', 'number'],
                                ['long', 'Longitude', 'number'],
                                ['timezone', 'Timezone (IANA)', 'text'],
                                ['city', 'City', 'text'],
                                ['state', 'State Code', 'text'],
                                ['country', 'Country (ISO 2)', 'text'],
                                ['postalCode', 'Postal Code', 'text'],
                            ] as const).map(([key, placeholder, type]) => (
                                <div key={key}>
                                    <label style={{ ...labelStyle, marginBottom: 3 }}>{placeholder}</label>
                                    <input
                                        type={type}
                                        placeholder={placeholder}
                                        value={(settings[key as keyof BraveSearchSettings] as string | number | undefined) ?? ''}
                                        onChange={e => {
                                            const v = e.target.value;
                                            setSettings(s => ({
                                                ...s,
                                                [key]: type === 'number' ? (v === '' ? undefined : Number(v)) : (v || undefined),
                                            }));
                                        }}
                                        style={{ ...inputStyle, fontSize: 12 }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Save button */}
                <button
                    onClick={handleSave}
                    style={{
                        padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: saved ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.08)',
                        color: saved ? '#4ade80' : 'rgba(255,255,255,0.7)',
                        fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
                        fontFamily: "'Courier New', monospace", transition: 'all 0.2s',
                    }}
                >
                    {saved ? 'Saved' : 'Save'}
                </button>
            </div>
        </div>
    );
}
