import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { testProvider } from '@/services/api';
import type { Provider, AdapterType } from '@/types/providers';

const PLACEHOLDER_PROVIDER: Omit<Provider, 'id' | 'createdAt'> = {
    name: '',
    baseUrl: '',
    apiKey: '',
    adapter: 'openai',
    notes: '',
    enabled: true,
};

const ADAPTER_OPTIONS: { value: AdapterType; label: string }[] = [
    { value: 'openai', label: 'OpenAI-compatible' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'ollama', label: 'Ollama (local)' },
];

// ─── Provider Form ────────────────────────────────────────────────────────────

interface ProviderFormProps {
    initial: Omit<Provider, 'id' | 'createdAt'>;
    onSave: (data: Omit<Provider, 'id' | 'createdAt'>) => void;
    onCancel: () => void;
}

function ProviderForm({ initial, onSave, onCancel }: ProviderFormProps) {
    const [form, setForm] = useState(initial);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);

    const field = (key: keyof typeof form, value: string | boolean) =>
        setForm(f => ({ ...f, [key]: value }));

    const handleTest = async () => {
        if (!form.baseUrl || !form.apiKey) return;
        setTesting(true);
        setTestResult(null);
        const ok = await testProvider({ ...form, id: 'test', createdAt: 0 });
        setTestResult(ok ? 'ok' : 'fail');
        setTesting(false);
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: '9px 12px',
        color: '#e8e0d4',
        fontSize: 13,
        fontFamily: 'system-ui, sans-serif',
        outline: 'none',
        boxSizing: 'border-box',
        marginTop: 4,
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: 10,
        color: 'rgba(255,255,255,0.35)',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        fontFamily: "'Courier New', monospace",
        marginTop: 16,
        marginBottom: 2,
    };

    return (
        <div
            style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 16,
                padding: 20,
                marginTop: 16,
            }}
        >
            <span style={labelStyle}>Name</span>
            <input style={inputStyle} value={form.name} onChange={e => field('name', e.target.value)} placeholder="e.g. nano-gpt" />

            <span style={labelStyle}>Base URL</span>
            <input style={inputStyle} value={form.baseUrl} onChange={e => field('baseUrl', e.target.value)} placeholder="https://…/v1" />

            <span style={labelStyle}>API Key</span>
            <input style={inputStyle} type="password" value={form.apiKey} onChange={e => field('apiKey', e.target.value)} placeholder="sk-…" autoComplete="off" />

            <span style={labelStyle}>Adapter</span>
            <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={form.adapter}
                onChange={e => field('adapter', e.target.value as AdapterType)}
            >
                {ADAPTER_OPTIONS.map(o => (
                    <option key={o.value} value={o.value} style={{ background: '#07050c' }}>
                        {o.label}
                    </option>
                ))}
            </select>

            <span style={labelStyle}>Notes (optional)</span>
            <input style={inputStyle} value={form.notes ?? ''} onChange={e => field('notes', e.target.value)} placeholder="e.g. NSFW OK, flatrate" />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                <button
                    onClick={handleTest}
                    disabled={testing || !form.baseUrl || !form.apiKey}
                    style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'transparent',
                        color: testing ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)',
                        fontSize: 11,
                        fontFamily: "'Courier New', monospace",
                        letterSpacing: '0.1em',
                        cursor: testing ? 'not-allowed' : 'pointer',
                    }}
                >
                    {testing ? 'testing…' : 'test connection'}
                    {testResult === 'ok' && <span style={{ color: '#7abfb0', marginLeft: 6 }}>✓</span>}
                    {testResult === 'fail' && <span style={{ color: '#ff6b6b', marginLeft: 6 }}>✗</span>}
                </button>

                <div style={{ flex: 1 }} />

                <button
                    onClick={onCancel}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: "'Courier New', monospace", cursor: 'pointer' }}
                >
                    cancel
                </button>
                <button
                    onClick={() => form.name && form.baseUrl && onSave(form)}
                    disabled={!form.name || !form.baseUrl}
                    style={{
                        padding: '8px 20px',
                        borderRadius: 8,
                        border: 'none',
                        background: form.name && form.baseUrl ? '#C9A96E' : 'rgba(255,255,255,0.1)',
                        color: form.name && form.baseUrl ? '#000000cc' : 'rgba(255,255,255,0.3)',
                        fontSize: 11,
                        fontFamily: "'Courier New', monospace",
                        cursor: form.name && form.baseUrl ? 'pointer' : 'not-allowed',
                        letterSpacing: '0.1em',
                    }}
                >
                    save
                </button>
            </div>
        </div>
    );
}

// ─── Provider Manager ─────────────────────────────────────────────────────────

export default function ProviderManager() {
    const { providers, addProvider, updateProvider, removeProvider } = useAppStore();
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const handleAdd = async (data: Omit<Provider, 'id' | 'createdAt'>) => {
        await addProvider(data);
        setAdding(false);
    };

    const handleUpdate = async (id: string, data: Omit<Provider, 'id' | 'createdAt'>) => {
        const existing = providers.find(p => p.id === id);
        if (!existing) return;
        await updateProvider({ ...existing, ...data });
        setEditing(null);
    };

    const handleToggle = async (provider: Provider) => {
        await updateProvider({ ...provider, enabled: !provider.enabled });
    };

    const handleDelete = async (id: string) => {
        await removeProvider(id);
        setConfirmDelete(null);
    };

    return (
        <div>
            {/* Provider list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {providers.map(provider => (
                    <div key={provider.id}>
                        <div
                            style={{
                                padding: '12px 16px',
                                borderRadius: 12,
                                border: `1px solid ${provider.enabled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
                                background: provider.enabled ? 'rgba(255,255,255,0.03)' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                opacity: provider.enabled ? 1 : 0.5,
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: provider.enabled ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)', fontFamily: 'system-ui, sans-serif' }}>
                                    {provider.name}
                                </div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: "'Courier New', monospace", marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {provider.baseUrl}
                                </div>
                                {provider.notes && (
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', marginTop: 1 }}>
                                        {provider.notes}
                                    </div>
                                )}
                            </div>

                            {/* Toggle enabled */}
                            <button
                                onClick={() => handleToggle(provider)}
                                style={{
                                    width: 36,
                                    height: 20,
                                    borderRadius: 10,
                                    border: 'none',
                                    background: provider.enabled ? '#7ABFB0' : 'rgba(255,255,255,0.1)',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    flexShrink: 0,
                                    transition: 'background 0.2s',
                                }}
                                aria-label={provider.enabled ? 'Disable' : 'Enable'}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 2,
                                        left: provider.enabled ? 18 : 2,
                                        width: 16,
                                        height: 16,
                                        borderRadius: '50%',
                                        background: '#ffffff',
                                        transition: 'left 0.2s',
                                    }}
                                />
                            </button>

                            {/* Edit */}
                            <button
                                onClick={() => setEditing(editing === provider.id ? null : provider.id)}
                                style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '4px 6px', minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                aria-label="Edit"
                            >
                                ✎
                            </button>

                            {/* Delete */}
                            {confirmDelete === provider.id ? (
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button
                                        onClick={() => handleDelete(provider.id)}
                                        style={{ fontSize: 10, color: '#ff6b6b', background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: "'Courier New', monospace" }}
                                    >
                                        del
                                    </button>
                                    <button
                                        onClick={() => setConfirmDelete(null)}
                                        style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: "'Courier New', monospace" }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmDelete(provider.id)}
                                    style={{ color: 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '4px 6px', minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    aria-label="Delete"
                                >
                                    ×
                                </button>
                            )}
                        </div>

                        {/* Inline edit form */}
                        {editing === provider.id && (
                            <ProviderForm
                                initial={{ name: provider.name, baseUrl: provider.baseUrl, apiKey: provider.apiKey, adapter: provider.adapter, notes: provider.notes, enabled: provider.enabled }}
                                onSave={data => handleUpdate(provider.id, data)}
                                onCancel={() => setEditing(null)}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Add new */}
            {adding ? (
                <ProviderForm
                    initial={PLACEHOLDER_PROVIDER}
                    onSave={handleAdd}
                    onCancel={() => setAdding(false)}
                />
            ) : (
                <button
                    onClick={() => setAdding(true)}
                    style={{
                        marginTop: 16,
                        width: '100%',
                        padding: '12px',
                        borderRadius: 12,
                        border: '1px dashed rgba(255,255,255,0.15)',
                        background: 'transparent',
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: 12,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        fontFamily: "'Courier New', monospace",
                        cursor: 'pointer',
                    }}
                >
                    + add provider
                </button>
            )}
        </div>
    );
}
