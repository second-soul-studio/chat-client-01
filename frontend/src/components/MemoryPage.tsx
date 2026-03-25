import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/stores/appStore';
import {
    getMemoryMeta, saveMemoryMeta,
    getMemoryTopics, saveMemoryTopic, deleteMemoryTopic,
    getAcceptedPendingEntries, getSuggestedPendingEntries,
    savePendingEntry, deletePendingEntry,
    deleteExpiredSuggestedEntries, getSettings,
} from '@/services/db';
import { consolidateMemory } from '@/services/memory';
import type { MemoryMeta, MemoryTopic, MemoryPendingEntry, MemoryType, Chat } from '@/types';
import { MEMORY_TYPE_EMOJI } from '@/types';

const ALL_TYPES: MemoryType[] = ['emotional', 'hard_fact', 'preference', 'event', 'nsfw'];

function estimateTokens(meta: MemoryMeta | null, topics: MemoryTopic[], pending: MemoryPendingEntry[]): number {
    let text = meta?.indexContent ?? '';
    for (const t of topics) text += t.content;
    for (const p of pending) text += p.content;
    return Math.ceil(text.length / 4);
}

export default function MemoryPage() {
    const { personaId } = useParams<{ personaId: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') === 'history' ? 'history' : 'memories';
    const { personas, providers, modelConfigs, settings, loadChatsForPersona, removeChat } = useAppStore();
    const persona = personas.find(p => p.id === personaId);

    const [meta, setMeta] = useState<MemoryMeta | null>(null);
    const [topics, setTopics] = useState<MemoryTopic[]>([]);
    const [pending, setPending] = useState<MemoryPendingEntry[]>([]);
    const [suggested, setSuggested] = useState<MemoryPendingEntry[]>([]);
    const [isConsolidating, setIsConsolidating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Topic editing
    const [editingTopic, setEditingTopic] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

    // Add memory form
    const [showAddForm, setShowAddForm] = useState(false);
    const [addType, setAddType] = useState<MemoryType>('hard_fact');
    const [addContent, setAddContent] = useState('');

    // History tab state
    const [chats, setChats] = useState<Chat[]>([]);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        if (!personaId) return;
        // Prune expired suggested entries before loading
        const s = await getSettings();
        await deleteExpiredSuggestedEntries(personaId, s.memorySettings.suggestedEntryExpiryDays);

        const [m, t, p, suggested_] = await Promise.all([
            getMemoryMeta(personaId),
            getMemoryTopics(personaId),
            getAcceptedPendingEntries(personaId),
            getSuggestedPendingEntries(personaId),
        ]);
        setMeta(m ?? null);
        setTopics(t);
        setPending(p);
        setSuggested(suggested_);
    }, [personaId]);

    useEffect(() => { loadData(); }, [loadData]);

    // Load chats for history tab
    useEffect(() => {
        if (personaId && activeTab === 'history') {
            loadChatsForPersona(personaId).then(setChats);
        }
    }, [personaId, activeTab, loadChatsForPersona]);

    const color = persona?.color ?? '#a78bfa';

    // --- Handlers ---

    const toggleTopic = (id: string) => {
        setExpandedTopics(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleStartEditTopic = (topic: MemoryTopic) => {
        setEditingTopic(topic.id);
        setEditContent(topic.content);
    };

    const handleSaveTopic = async (topicId: string) => {
        const topic = topics.find(t => t.id === topicId);
        if (!topic) return;
        await saveMemoryTopic({ ...topic, content: editContent, updatedAt: Date.now() });
        setEditingTopic(null);
        await loadData();
    };

    const handleDeleteTopic = async (topicId: string) => {
        await deleteMemoryTopic(topicId);
        await loadData();
    };

    const handleDeletePending = async (entryId: string) => {
        await deletePendingEntry(entryId);
        if (meta) {
            await saveMemoryMeta({ ...meta, pendingCount: Math.max(0, meta.pendingCount - 1) });
        }
        await loadData();
    };

    const handleAcceptSuggested = async (entry: MemoryPendingEntry) => {
        const accepted = { ...entry, status: 'accepted' as const };
        await savePendingEntry(accepted);
        const currentMeta = meta ?? { personaId: personaId!, indexContent: '', lastConsolidatedAt: null, pendingCount: 0, nsfwEnabled: false };
        await saveMemoryMeta({ ...currentMeta, pendingCount: currentMeta.pendingCount + 1 });
        await loadData();
    };

    const handleAcceptAllSuggested = async () => {
        const currentMeta = meta ?? { personaId: personaId!, indexContent: '', lastConsolidatedAt: null, pendingCount: 0, nsfwEnabled: false };
        let count = currentMeta.pendingCount;
        for (const entry of suggested) {
            await savePendingEntry({ ...entry, status: 'accepted' as const });
            count++;
        }
        await saveMemoryMeta({ ...currentMeta, pendingCount: count });
        await loadData();
    };

    const handleDismissSuggested = async (entryId: string) => {
        await deletePendingEntry(entryId);
        await loadData();
    };

    const handleToggleNsfw = async () => {
        const updated: MemoryMeta = meta
            ? { ...meta, nsfwEnabled: !meta.nsfwEnabled }
            : { personaId: personaId!, indexContent: '', lastConsolidatedAt: null, pendingCount: 0, nsfwEnabled: true };
        await saveMemoryMeta(updated);
        setMeta(updated);
    };

    const handleConsolidate = async () => {
        if (!personaId || pending.length === 0) return;
        setIsConsolidating(true);
        setError(null);
        try {
            const workerModelId = settings?.memorySettings?.workerModelId;
            const defaultModelId = persona?.modelId ?? settings?.defaultModelId;
            const modelId = workerModelId ?? defaultModelId;
            const model = modelId ? modelConfigs.find(m => m.id === modelId) : null;
            const provider = model ? providers.find(p => p.id === model.providerId && p.enabled) : null;
            if (!model || !provider) {
                setError('No model/provider configured for memory consolidation.');
                return;
            }
            await consolidateMemory(personaId, provider, model);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Consolidation failed');
        } finally {
            setIsConsolidating(false);
        }
    };

    const handleDeleteAllPending = async () => {
        if (!personaId || pending.length === 0) return;
        for (const entry of pending) {
            await deletePendingEntry(entry.id);
        }
        if (meta) {
            await saveMemoryMeta({ ...meta, pendingCount: 0 });
        }
        await loadData();
    };

    const handleDeleteChat = async (chatId: string) => {
        await removeChat(chatId);
        setChats(prev => prev.filter(c => c.id !== chatId));
        setConfirmDelete(null);
    };

    const switchTab = (tab: 'memories' | 'history') => {
        setSearchParams(tab === 'history' ? { tab: 'history' } : {});
    };

    const handleAddMemory = async () => {
        if (!personaId || !addContent.trim()) return;
        const entry: MemoryPendingEntry = {
            id: uuidv4(),
            personaId,
            type: addType,
            content: addContent.trim(),
            extractedAt: Date.now(),
            sourceChatId: 'manual',
            status: 'accepted',
        };
        await savePendingEntry(entry);
        if (meta) {
            await saveMemoryMeta({ ...meta, pendingCount: meta.pendingCount + 1 });
        } else {
            await saveMemoryMeta({ personaId, indexContent: '', lastConsolidatedAt: null, pendingCount: 1, nsfwEnabled: false });
        }
        setAddContent('');
        setShowAddForm(false);
        await loadData();
    };

    if (!persona) {
        return (
            <div style={{ minHeight: '100%', background: '#07050c', padding: '24px 16px', color: 'rgba(255,255,255,0.5)' }}>
                Persona not found.
                <button onClick={() => navigate('/')} style={{ color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8 }}>← Back</button>
            </div>
        );
    }

    const tokens = estimateTokens(meta, topics, pending);

    return (
        <div style={{ minHeight: '100%', background: '#07050c', padding: '24px 16px', paddingBottom: 80 }}>
            <div style={{ maxWidth: 700, margin: '0 auto' }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <button
                        onClick={() => navigate('/')}
                        style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                        aria-label="Back"
                    >←</button>
                    <div
                        style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: persona.gradient, border: `1px solid ${color}44`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontFamily: "'Instrument Serif', Georgia, serif", color,
                        }}
                    >
                        {persona.avatarUrl
                            ? <img src={persona.avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            : persona.name[0]
                        }
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 20, fontFamily: "'Instrument Serif', Georgia, serif", color: '#fff', fontWeight: 400 }}>
                            Nostalgia
                        </h2>
                        <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace" }}>
                            {persona.name}
                        </p>
                    </div>
                    {/* Token estimate */}
                    {tokens > 0 && (
                        <span style={{
                            marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.25)',
                            fontFamily: "'Courier New', monospace", letterSpacing: '0.05em',
                        }}>
                            ~{tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens} tok
                        </span>
                    )}
                </div>

                {/* Tab bar */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {(['memories', 'history'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => switchTab(tab)}
                            style={{
                                flex: 1, padding: '10px 0', background: 'none', border: 'none',
                                borderBottom: activeTab === tab ? `2px solid ${color}` : '2px solid transparent',
                                color: activeTab === tab ? color : 'rgba(255,255,255,0.3)',
                                fontSize: 12, fontFamily: "'Courier New', monospace",
                                letterSpacing: '0.15em', textTransform: 'uppercase',
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}
                        >
                            {tab === 'memories' ? '◎ Memories' : '📜 History'}
                        </button>
                    ))}
                </div>

                {activeTab === 'memories' && (<>

                    {/* Memory disabled notice */}
                    {persona.memoryEnabled === false && (
                        <div style={{
                            padding: '14px 16px', marginBottom: 16, borderRadius: 10,
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: "'Lora', Georgia, serif",
                            textAlign: 'center',
                        }}>
                            Memory is disabled for this persona. Enable it in the persona settings to start remembering.
                        </div>
                    )}

                    {/* NSFW toggle */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', marginBottom: 16, borderRadius: 10,
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: "'Lora', Georgia, serif" }}>
                            🔥 Include NSFW in prompt
                        </span>
                        <button
                            onClick={handleToggleNsfw}
                            style={{
                                width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                                background: meta?.nsfwEnabled ? `${color}88` : 'rgba(255,255,255,0.1)',
                                position: 'relative', transition: 'background 0.2s',
                            }}
                        >
                            <div style={{
                                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                                position: 'absolute', top: 3,
                                left: meta?.nsfwEnabled ? 21 : 3,
                                transition: 'left 0.2s',
                            }} />
                        </button>
                    </div>

                    {/* Action bar */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                        <button
                            onClick={handleConsolidate}
                            disabled={pending.length === 0 || isConsolidating}
                            style={{
                                padding: '8px 14px', borderRadius: 10, border: `1px solid ${color}44`,
                                background: pending.length > 0 ? `${color}18` : 'transparent',
                                color: pending.length > 0 ? color : 'rgba(255,255,255,0.25)',
                                fontSize: 12, fontFamily: "'Courier New', monospace",
                                cursor: pending.length > 0 && !isConsolidating ? 'pointer' : 'default',
                                opacity: isConsolidating ? 0.6 : 1,
                                transition: 'all 0.2s',
                            }}
                        >
                            {isConsolidating ? '⟳ Consolidating…' : `💾 Consolidate${pending.length > 0 ? ` (${pending.length} pending)` : ''}`}
                        </button>
                        <button
                            onClick={() => setShowAddForm(v => !v)}
                            style={{
                                padding: '8px 14px', borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'transparent', color: 'rgba(255,255,255,0.5)',
                                fontSize: 12, fontFamily: "'Courier New', monospace",
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}
                        >
                            + Add Memory
                        </button>
                        {pending.length > 0 && (
                            <button
                                onClick={handleDeleteAllPending}
                                style={{
                                    padding: '8px 14px', borderRadius: 10,
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    background: 'rgba(239,68,68,0.08)', color: 'rgba(239,68,68,0.6)',
                                    fontSize: 12, fontFamily: "'Courier New', monospace",
                                    cursor: 'pointer', transition: 'all 0.2s',
                                }}
                            >
                                🗑 Delete Pending ({pending.length})
                            </button>
                        )}
                    </div>

                    {/* Error message */}
                    {error && (
                        <div style={{
                            padding: '10px 14px', marginBottom: 16, borderRadius: 10,
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                            color: '#f87171', fontSize: 12, fontFamily: "'Courier New', monospace",
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Add memory form */}
                    {showAddForm && (
                        <div style={{
                            padding: 14, marginBottom: 16, borderRadius: 12,
                            background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}33`,
                        }}>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: "'Courier New', monospace", marginBottom: 10 }}>
                                Add Memory
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                                {ALL_TYPES.map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setAddType(t)}
                                        style={{
                                            padding: '4px 10px', borderRadius: 8, border: `1px solid ${addType === t ? color + '66' : 'rgba(255,255,255,0.08)'}`,
                                            background: addType === t ? `${color}22` : 'transparent',
                                            color: addType === t ? color : 'rgba(255,255,255,0.4)',
                                            fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
                                        }}
                                    >
                                        {MEMORY_TYPE_EMOJI[t]} {t.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>
                            <textarea
                                value={addContent}
                                onChange={e => setAddContent(e.target.value)}
                                placeholder="What should be remembered?"
                                rows={2}
                                style={{
                                    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 8, color: '#e8e0d4', fontSize: 13, fontFamily: "'Lora', Georgia, serif",
                                    padding: '8px 10px', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => { setShowAddForm(false); setAddContent(''); }}
                                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddMemory}
                                    disabled={!addContent.trim()}
                                    style={{
                                        padding: '6px 12px', borderRadius: 8, border: `1px solid ${color}44`,
                                        background: `${color}22`, color, fontSize: 11, cursor: addContent.trim() ? 'pointer' : 'default',
                                        opacity: addContent.trim() ? 1 : 0.4,
                                    }}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Topics section */}
                    <div style={{ marginBottom: 28 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace", marginBottom: 10 }}>
                            Topics
                        </div>
                        {topics.length === 0 ? (
                            <div style={{ padding: '20px 0', color: 'rgba(255,255,255,0.2)', fontSize: 13, fontFamily: "'Lora', Georgia, serif", textAlign: 'center' }}>
                                {pending.length > 0 ? 'Consolidate pending entries to create topics.' : 'No memories yet. Start chatting!'}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {topics.map(topic => {
                                    const isExpanded = expandedTopics.has(topic.id);
                                    const isEditing = editingTopic === topic.id;
                                    return (
                                        <div
                                            key={topic.id}
                                            style={{
                                                borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)',
                                                background: 'rgba(255,255,255,0.02)', overflow: 'hidden',
                                            }}
                                        >
                                            {/* Topic header */}
                                            <button
                                                onClick={() => toggleTopic(topic.id)}
                                                style={{
                                                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '12px 14px', background: 'none', border: 'none',
                                                    cursor: 'pointer', textAlign: 'left',
                                                }}
                                            >
                                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                                                <span style={{ fontSize: 14, color, fontFamily: "'Instrument Serif', Georgia, serif" }}>{topic.slug}</span>
                                                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.15)', fontFamily: "'Courier New', monospace" }}>
                                                    {new Date(topic.updatedAt).toLocaleDateString()}
                                                </span>
                                            </button>
                                            {/* Expanded content */}
                                            {isExpanded && (
                                                <div style={{ padding: '0 14px 14px' }}>
                                                    {isEditing ? (
                                                        <>
                                                            <textarea
                                                                value={editContent}
                                                                onChange={e => setEditContent(e.target.value)}
                                                                rows={6}
                                                                style={{
                                                                    width: '100%', background: 'rgba(255,255,255,0.04)',
                                                                    border: `1px solid ${color}33`, borderRadius: 8,
                                                                    color: '#e8e0d4', fontSize: 13, fontFamily: "'Lora', Georgia, serif",
                                                                    padding: '8px 10px', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                                                                    lineHeight: 1.6,
                                                                }}
                                                            />
                                                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                                                <button
                                                                    onClick={() => setEditingTopic(null)}
                                                                    style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    onClick={() => handleSaveTopic(topic.id)}
                                                                    style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${color}44`, background: `${color}22`, color, fontSize: 11, cursor: 'pointer' }}
                                                                >
                                                                    Save
                                                                </button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                                                {topic.content}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                                                <button
                                                                    onClick={() => handleStartEditTopic(topic)}
                                                                    style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: 11, cursor: 'pointer' }}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteTopic(topic.id)}
                                                                    style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'transparent', color: 'rgba(239,68,68,0.5)', fontSize: 11, cursor: 'pointer' }}
                                                                >
                                                                    🗑 Delete
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Suggested entries — needs review */}
                    {suggested.length > 0 && (
                        <div style={{ marginBottom: 28 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div style={{ fontSize: 10, color, letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace" }}>
                                    ✨ New Suggestions ({suggested.length})
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                        onClick={handleAcceptAllSuggested}
                                        style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${color}44`, background: `${color}18`, color, fontSize: 10, fontFamily: "'Courier New', monospace", cursor: 'pointer' }}
                                    >
                                        Accept All
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {suggested.map(entry => (
                                    <div
                                        key={entry.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '10px 14px', borderRadius: 10,
                                            background: `${color}08`, border: `1px solid ${color}22`,
                                        }}
                                    >
                                        <span style={{ fontSize: 14, flexShrink: 0 }}>{MEMORY_TYPE_EMOJI[entry.type]}</span>
                                        <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}>
                                            {entry.content}
                                        </span>
                                        <button
                                            onClick={() => handleAcceptSuggested(entry)}
                                            style={{ flexShrink: 0, padding: '4px 8px', borderRadius: 6, border: `1px solid ${color}44`, background: `${color}18`, color, fontSize: 11, cursor: 'pointer' }}
                                        >
                                            ✓
                                        </button>
                                        <button
                                            onClick={() => handleDismissSuggested(entry.id)}
                                            style={{ flexShrink: 0, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', background: 'transparent', color: 'rgba(255,255,255,0.2)', fontSize: 11, cursor: 'pointer' }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pending entries section */}
                    {pending.length > 0 && (
                        <div style={{ marginBottom: 28 }}>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace", marginBottom: 10 }}>
                                Pending Entries ({pending.length})
                            </div>
                            {pending.length > 25 && (
                                <div style={{ padding: '8px 12px', marginBottom: 8, borderRadius: 8, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: 'rgba(234,179,8,0.7)', fontSize: 11, fontFamily: "'Courier New', monospace" }}>
                                    You have many pending entries. Consider consolidating.
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {pending.map(entry => (
                                    <div
                                        key={entry.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '10px 14px', borderRadius: 10,
                                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                                        }}
                                    >
                                        <span style={{ fontSize: 14, flexShrink: 0 }}>{MEMORY_TYPE_EMOJI[entry.type]}</span>
                                        <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}>
                                            {entry.content}
                                        </span>
                                        <button
                                            onClick={() => handleDeletePending(entry.id)}
                                            style={{
                                                flexShrink: 0, padding: '4px 8px', borderRadius: 6,
                                                border: '1px solid rgba(255,255,255,0.06)', background: 'transparent',
                                                color: 'rgba(255,255,255,0.2)', fontSize: 11, cursor: 'pointer',
                                            }}
                                        >
                                            🗑
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                </>)}

                {activeTab === 'history' && (
                    <div>
                        {chats.length === 0 ? (
                            <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13, fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic' }}>
                                No conversations yet.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {chats.map(chat => (
                                    <div
                                        key={chat.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            gap: 12, padding: '12px 16px', borderRadius: 12,
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            background: 'rgba(255,255,255,0.02)',
                                            cursor: 'pointer', transition: 'background 0.15s',
                                        }}
                                        onClick={() => navigate(`/chat/${personaId}/${chat.id}`)}
                                    >
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontFamily: "'Lora', Georgia, serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {chat.title}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: "'Courier New', monospace", marginTop: 3 }}>
                                                {new Date(chat.updatedAt).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                {' · '}
                                                {chat.messages.filter(m => m.role === 'user').length} messages
                                            </div>
                                        </div>

                                        {confirmDelete === chat.id ? (
                                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleDeleteChat(chat.id)}
                                                    style={{ fontSize: 10, color: '#ff6b6b', background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: "'Courier New', monospace" }}
                                                >
                                                    delete
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                                                    style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: "'Courier New', monospace" }}
                                                >
                                                    cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={e => { e.stopPropagation(); setConfirmDelete(chat.id); }}
                                                style={{ color: 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '4px 8px', flexShrink: 0, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                aria-label="Delete chat"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
