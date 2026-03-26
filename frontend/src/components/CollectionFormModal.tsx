import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import type { KnowledgeCollection } from '@/types';
import { createCollection, updateCollection } from '@/services/knowledge/manager';
import { embedText } from '@/services/knowledge/embeddings';

const ACCENT = '#C9A96E';

interface Props {
    collection?: KnowledgeCollection | null;
    onClose: () => void;
}

export default function CollectionFormModal({ collection, onClose }: Props) {
    const { providers, settings, loadCollections } = useAppStore();

    const defaultChunkSize = settings?.knowledge.defaultChunkSize ?? 1000;
    const defaultChunkOverlap = settings?.knowledge.defaultChunkOverlap ?? 100;

    const enabledProviders = providers.filter(p => p.enabled);

    const [name, setName] = useState(collection?.name ?? '');
    const [description, setDescription] = useState(collection?.description ?? '');
    const [embeddingProviderId, setEmbeddingProviderId] = useState(
        collection?.embeddingProviderId ?? enabledProviders[0]?.id ?? '',
    );
    const [embeddingModelSlug, setEmbeddingModelSlug] = useState(collection?.embeddingModelSlug ?? '');
    const [embeddingDimension, setEmbeddingDimension] = useState<number>(collection?.embeddingDimension ?? 0);
    const [chunkSize, setChunkSize] = useState(collection?.chunkSize ?? defaultChunkSize);
    const [chunkOverlap, setChunkOverlap] = useState(collection?.chunkOverlap ?? defaultChunkOverlap);

    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [saving, setSaving] = useState(false);

    const canSave = name.trim().length > 0 && embeddingProviderId && embeddingModelSlug.trim().length > 0 && embeddingDimension > 0;

    const handleTest = async () => {
        if (!embeddingProviderId || !embeddingModelSlug.trim()) return;
        setTestStatus('testing');
        setTestMessage('');
        try {
            const vec = await embedText('test', embeddingProviderId, embeddingModelSlug.trim());
            setEmbeddingDimension(vec.length);
            setTestStatus('ok');
            setTestMessage(`Dimension: ${vec.length}`);
        } catch (err) {
            setTestStatus('error');
            setTestMessage(err instanceof Error ? err.message : String(err));
        }
    };

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            const data = {
                name: name.trim(),
                description: description.trim() || undefined,
                personaIds: collection?.personaIds ?? [],
                embeddingProviderId,
                embeddingModelSlug: embeddingModelSlug.trim(),
                embeddingDimension,
                chunkSize,
                chunkOverlap,
            };
            if (collection) {
                await updateCollection(collection.id, data);
            } else {
                await createCollection(data);
            }
            await loadCollections();
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 100,
                }}
            />

            {/* Sheet */}
            <div
                style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    maxHeight: '90dvh',
                    background: '#0f0d17',
                    borderTop: `1px solid ${ACCENT}30`,
                    borderRadius: '20px 20px 0 0',
                    zIndex: 101,
                    overflowY: 'auto',
                    paddingBottom: 'env(safe-area-inset-bottom, 16px)',
                    animation: 'sheetSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
                }}
            >
                {/* Handle */}
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8 }}>
                    <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
                </div>

                <div style={{ padding: '8px 24px 24px' }}>
                    <div style={{ marginBottom: 20, textAlign: 'center' }}>
                        <h2 style={{
                            fontFamily: "'Instrument Serif', Georgia, serif",
                            fontSize: 22,
                            color: '#fff',
                            fontWeight: 400,
                            margin: 0,
                        }}>
                            {collection ? 'Edit Collection' : 'New Collection'}
                        </h2>
                    </div>

                    <SectionHeader label="Details" />

                    <Field label="Name">
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Product Documentation"
                            maxLength={64}
                            style={inputStyle()}
                            autoFocus
                        />
                    </Field>

                    <Field label="Description">
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Optional description…"
                            rows={2}
                            style={{ ...inputStyle(), resize: 'none', lineHeight: 1.6 }}
                        />
                    </Field>

                    <SectionHeader label="Embedding" />

                    <Field label="Provider">
                        <select
                            value={embeddingProviderId}
                            onChange={e => setEmbeddingProviderId(e.target.value)}
                            style={{ ...inputStyle(), cursor: 'pointer' }}
                        >
                            {enabledProviders.length === 0 && (
                                <option value="">No enabled providers</option>
                            )}
                            {enabledProviders.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Model Slug">
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                type="text"
                                value={embeddingModelSlug}
                                onChange={e => setEmbeddingModelSlug(e.target.value)}
                                placeholder="e.g. text-embedding-3-small"
                                style={{ ...inputStyle(), flex: 1 }}
                            />
                            <button
                                onClick={handleTest}
                                disabled={testStatus === 'testing' || !embeddingProviderId || !embeddingModelSlug.trim()}
                                style={{
                                    padding: '0 16px',
                                    borderRadius: 10,
                                    border: `1px solid ${ACCENT}50`,
                                    background: 'rgba(201,169,110,0.1)',
                                    color: ACCENT,
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                    fontFamily: "'Courier New', monospace",
                                }}
                            >
                                {testStatus === 'testing' ? '…' : 'Test'}
                            </button>
                        </div>
                        {testStatus !== 'idle' && (
                            <div style={{
                                marginTop: 6,
                                fontSize: 11,
                                fontFamily: "'Courier New', monospace",
                                color: testStatus === 'ok' ? '#8DBF7A' : testStatus === 'error' ? '#D4706A' : 'rgba(255,255,255,0.4)',
                            }}>
                                {testMessage}
                            </div>
                        )}
                    </Field>

                    <Field label="Embedding Dimension">
                        <input
                            type="number"
                            value={embeddingDimension || ''}
                            onChange={e => setEmbeddingDimension(Number(e.target.value))}
                            placeholder="Auto-filled by Test, or enter manually"
                            min={1}
                            style={inputStyle()}
                        />
                    </Field>

                    <SectionHeader label="Chunking" />

                    <Field label="Chunk Size (tokens)">
                        <input
                            type="number"
                            value={chunkSize}
                            onChange={e => setChunkSize(Number(e.target.value))}
                            min={100}
                            max={8000}
                            style={inputStyle()}
                        />
                    </Field>

                    <Field label="Chunk Overlap (tokens)">
                        <input
                            type="number"
                            value={chunkOverlap}
                            onChange={e => setChunkOverlap(Number(e.target.value))}
                            min={0}
                            max={2000}
                            style={inputStyle()}
                        />
                    </Field>

                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                        <button
                            onClick={onClose}
                            style={{
                                flex: 1,
                                padding: '14px 0',
                                borderRadius: 12,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'transparent',
                                color: 'rgba(255,255,255,0.5)',
                                fontSize: 14,
                                cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!canSave || saving}
                            style={{
                                flex: 2,
                                padding: '14px 0',
                                borderRadius: 12,
                                border: 'none',
                                background: canSave && !saving ? ACCENT : 'rgba(255,255,255,0.1)',
                                color: canSave && !saving ? '#07050c' : 'rgba(255,255,255,0.3)',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: canSave && !saving ? 'pointer' : 'not-allowed',
                                fontFamily: "'Courier New', monospace",
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                            }}
                        >
                            {saving ? '…' : collection ? 'Save Changes' : 'Create Collection'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{
                display: 'block',
                fontSize: 11,
                color: 'rgba(255,255,255,0.4)',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                fontFamily: "'Courier New', monospace",
                marginBottom: 8,
            }}>
                {label}
            </label>
            {children}
        </div>
    );
}

function inputStyle(): React.CSSProperties {
    return {
        width: '100%',
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.05)',
        color: '#fff',
        fontSize: 14,
        outline: 'none',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
    };
}

function SectionHeader({ label }: { label: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
            <span style={{
                fontSize: 9,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                fontFamily: "'Courier New', monospace",
                whiteSpace: 'nowrap',
            }}>
                {label}
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
        </div>
    );
}
