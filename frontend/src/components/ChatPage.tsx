import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/stores/appStore';
import { toolLoop } from '@/services/toolLoop';
import { AssistantBubble, UserBubble, TypingIndicator } from './ChatBubbles';
import MemorySuggestion from './MemorySuggestion';
import FloatingHearts from './FloatingHearts';
import MemorySidebar from './MemorySidebar';
import { detectMemories, shouldRunDetection, consolidateMemory } from '@/services/memory';
import { savePendingEntry, deletePendingEntry, getMemoryMeta, saveMemoryMeta, getAcceptedPendingEntries, getSuggestedPendingEntries, deleteExpiredSuggestedEntries, getSettings, updateChatLastDetection } from '@/services/db';
import type { Message, MemoryPendingEntry, MemoryType } from '@/types';
import { MEMORY_TYPE_EMOJI } from '@/types';

export default function ChatPage() {
    const { personaId, chatId } = useParams<{ personaId: string; chatId?: string }>();
    const navigate = useNavigate();

    const {
        personas, providers, modelConfigs, settings, collections,
        activeChat, isStreaming,
        loadOrCreateChat, addMessage, updateLastAssistantMessage,
        finaliseMessage, setIsStreaming,
        streamingThinking, updateStreamingThinking,
        thinkingBlockOpen, setThinkingBlockOpen,
        removeLastAssistantMessage,
        toolConfigs,
        pendingToolCalls,
        addPendingToolCall,
        updatePendingToolCall,
        clearPendingToolCalls,
        updateLastToolCalls,
        incrementTurnCount,
        resetTurnCount,
        setTurnCount,
    } = useAppStore();

    const persona = personas.find(p => p.id === personaId);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const inputWrapperRef = useRef<HTMLDivElement>(null);
    const [input, setInput] = useState('');
    const [error, setError] = useState<string | null>(null);

    // #mention autocomplete
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionAnchorIndex, setMentionAnchorIndex] = useState(0); // start position of current #token
    // Thinking starts at persona's default; user can flip it per conversation
    const [thinkingEnabled, setThinkingEnabled] = useState(() => persona?.thinkingEnabled ?? false);
    const [searchEnabled, setSearchEnabled] = useState(false);
    const hasTools = toolConfigs.some(c => c.enabled);

    // Memory detection state
    const [suggestedEntries, setSuggestedEntries] = useState<MemoryPendingEntry[]>([]);
    const [isDetecting, setIsDetecting] = useState(false);
    const [showHearts, setShowHearts] = useState(false);
    const [isBadgePulsing, setIsBadgePulsing] = useState(false);
    const prevSuggestedCount = useRef(0);

    const [retryInfo, setRetryInfo] = useState<{ attempt: number; max: number } | null>(null);

    // Memory sidebar state
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const sidebarOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Detection bubble state
    const [detectionBubble, setDetectionBubble] = useState<Partial<Record<MemoryType, number>> | null>(null);
    const detectionBubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clean up timers on unmount
    useEffect(() => {
        return () => {
            if (sidebarOpenTimer.current) clearTimeout(sidebarOpenTimer.current);
            if (detectionBubbleTimer.current) clearTimeout(detectionBubbleTimer.current);
        };
    }, []);

    // Initialise chat + load suggested memory entries
    useEffect(() => {
        if (personaId) {
            (async () => {
                await loadOrCreateChat(personaId, chatId);

                // Init turn counter from persisted chat data
                const chat = useAppStore.getState().activeChat;
                if (chat) {
                    const totalTurns = Math.floor(chat.messages.length / 2);
                    const lastAt = chat.lastDetectionAt ?? 0;
                    const turnsSince = Math.max(0, totalTurns - lastAt);
                    setTurnCount(personaId, turnsSince);
                }

                // Prune expired suggestions, then load surviving ones
                const s = await getSettings();
                await deleteExpiredSuggestedEntries(personaId, s.memorySettings.suggestedEntryExpiryDays);
                const existing = await getSuggestedPendingEntries(personaId);
                if (existing.length > 0) {
                    setSuggestedEntries(existing);
                }
            })();
        }
    }, [personaId, chatId, loadOrCreateChat, setTurnCount]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeChat?.messages.length, isStreaming]);

    // Restore focus to input after streaming ends
    useEffect(() => {
        if (!isStreaming) {
            textareaRef.current?.focus();
        }
    }, [isStreaming]);

    // Pulse badge when new suggestions arrive
    useEffect(() => {
        if (suggestedEntries.length > prevSuggestedCount.current && suggestedEntries.length > 0) {
            setIsBadgePulsing(true);
            const timer = setTimeout(() => setIsBadgePulsing(false), 1000);
            return () => clearTimeout(timer);
        }
        prevSuggestedCount.current = suggestedEntries.length;
    }, [suggestedEntries.length]);

    // Auto-resize textarea + #mention detection
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setInput(value);
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, window.innerHeight * 0.5)}px`;

        // Detect a #mention token immediately before the cursor
        const cursor = e.target.selectionStart ?? value.length;
        const textBeforeCursor = value.slice(0, cursor);
        const mentionMatch = textBeforeCursor.match(/#([\w-]*)$/);
        if (mentionMatch && collections.length > 0) {
            setMentionQuery(mentionMatch[1].toLowerCase());
            setMentionAnchorIndex(cursor - mentionMatch[0].length);
        } else {
            setMentionQuery(null);
        }
    };

    const insertMention = (collectionName: string) => {
        const cursor = textareaRef.current?.selectionStart ?? input.length;
        const newText = input.slice(0, mentionAnchorIndex) + `#${collectionName}` + input.slice(cursor);
        setInput(newText);
        setMentionQuery(null);
        // Restore focus
        setTimeout(() => {
            if (textareaRef.current) {
                const pos = mentionAnchorIndex + collectionName.length + 1;
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(pos, pos);
            }
        }, 0);
    };

    // ─── Memory Detection ─────────────────────────────────────────────────────

    const maybeAutoConsolidate = useCallback(async () => {
        if (!personaId || !settings?.memorySettings.autoConsolidate) return;
        try {
            const accepted = await getAcceptedPendingEntries(personaId);
            if (accepted.length < settings.memorySettings.consolidationThreshold) return;

            const workerModelId = settings.memorySettings.workerModelId;
            const modelId = workerModelId ?? persona?.modelId ?? settings.defaultModelId;
            const model = modelId ? modelConfigs.find(m => m.id === modelId) : null;
            const provider = model ? providers.find(p => p.id === model.providerId && p.enabled) : null;
            if (!model || !provider) return;

            await consolidateMemory(personaId, provider, model);
        } catch (err) {
            console.error('Auto-consolidation failed:', err);
        }
    }, [personaId, settings, persona, modelConfigs, providers]);

    const triggerDetection = useCallback(async (msgs: Message[], silent = false) => {
        if (!personaId || !activeChat || !settings || !persona || persona.memoryEnabled === false) return;

        const workerModelId = settings.memorySettings.workerModelId;
        const modelId = workerModelId ?? persona.modelId ?? settings.defaultModelId;
        const model = modelId ? modelConfigs.find(m => m.id === modelId) : null;
        const provider = model ? providers.find(p => p.id === model.providerId && p.enabled) : null;
        if (!model || !provider) return;

        if (!silent) setIsDetecting(true);
        try {
            const recentMessages = msgs.slice(-10);

            // Load existing memory context for cross-detection dedup
            const meta = await getMemoryMeta(personaId);
            const acceptedPending = await getAcceptedPendingEntries(personaId);
            const existingContext = meta ? {
                indexContent: meta.indexContent,
                acceptedPending,
                nsfwEnabled: meta.nsfwEnabled,
            } : undefined;

            const entries = await detectMemories(recentMessages, personaId, activeChat.id, provider, model, existingContext);
            resetTurnCount(personaId);

            // Persist detection point for turn tracking across reloads
            const totalTurns = Math.floor(msgs.length / 2);
            await updateChatLastDetection(activeChat.id, totalTurns);

            if (entries.length > 0) {
                // Always persist to DB first so entries survive navigation
                for (const entry of entries) {
                    await savePendingEntry(entry);
                }

                if (silent) {
                    await maybeAutoConsolidate();
                } else {
                    // Show in-chat popup for immediate review
                    setSuggestedEntries(prev => [...prev, ...entries]);

                    // Show rising bubble with type breakdown
                    const counts = entries.reduce<Partial<Record<MemoryType, number>>>((acc, e) => {
                        acc[e.type] = (acc[e.type] ?? 0) + 1;
                        return acc;
                    }, {});
                    if (detectionBubbleTimer.current) clearTimeout(detectionBubbleTimer.current);
                    setDetectionBubble(counts);
                    detectionBubbleTimer.current = setTimeout(() => setDetectionBubble(null), 3000);
                }
            }
        } catch (err) {
            console.error('Memory detection failed:', err);
        } finally {
            if (!silent) setIsDetecting(false);
        }
    }, [personaId, activeChat, settings, persona, modelConfigs, providers, resetTurnCount, maybeAutoConsolidate]);

    // Session-end detection: fire-and-forget on unmount
    useEffect(() => {
        const pid = personaId;
        return () => {
            if (!pid) return;
            const turns = useAppStore.getState().turnsSinceLastDetection[pid] ?? 0;
            const chat = useAppStore.getState().activeChat;
            if (turns > 0 && chat && chat.messages.length > 0) {
                triggerDetection(chat.messages, true);
            }
        };
    }, [personaId, triggerDetection]);

    // Memory accept/dismiss handlers
    const handleAcceptEntry = useCallback(async (entry: MemoryPendingEntry) => {
        if (!personaId) return;
        const accepted = { ...entry, status: 'accepted' as const };
        await savePendingEntry(accepted);

        const meta = await getMemoryMeta(personaId) ?? {
            personaId,
            indexContent: '',
            lastConsolidatedAt: null,
            pendingCount: 0,
            nsfwEnabled: true,
        };
        meta.pendingCount++;
        await saveMemoryMeta(meta);

        if (entry.type === 'emotional' || entry.type === 'nsfw') {
            setShowHearts(true);
        }
        setSuggestedEntries(prev => prev.filter(e => e.id !== entry.id));
    }, [personaId]);

    const handleAcceptAll = useCallback(async () => {
        for (const entry of suggestedEntries) {
            await handleAcceptEntry(entry);
        }
        await maybeAutoConsolidate();
    }, [suggestedEntries, handleAcceptEntry, maybeAutoConsolidate]);

    const handleDismissEntry = useCallback(async (entryId: string) => {
        await deletePendingEntry(entryId);
        setSuggestedEntries(prev => prev.filter(e => e.id !== entryId));
    }, []);

    const handleDismissAll = useCallback(async () => {
        for (const entry of suggestedEntries) {
            await deletePendingEntry(entry.id);
        }
        setSuggestedEntries([]);
    }, [suggestedEntries]);

    const handleEditEntry = useCallback(async (entryId: string, newContent: string) => {
        setSuggestedEntries(prev => {
            const updated = prev.map(e => e.id === entryId ? { ...e, content: newContent } : e);
            const entry = updated.find(e => e.id === entryId);
            if (entry) savePendingEntry(entry);
            return updated;
        });
    }, []);

    const handleSidebarMouseEnter = useCallback(() => {
        if (sidebarOpenTimer.current) clearTimeout(sidebarOpenTimer.current);
        sidebarOpenTimer.current = setTimeout(() => setSidebarOpen(true), 200);
    }, []);

    const handleSidebarMouseLeave = useCallback(() => {
        if (sidebarOpenTimer.current) clearTimeout(sidebarOpenTimer.current);
        setSidebarOpen(false);
    }, []);

    const doSend = useCallback(async (_content: string, priorMessages: Message[]) => {
        if (!persona || !settings) return;

        const modelId = persona.modelId ?? settings.defaultModelId;
        const model = modelId ? modelConfigs.find(m => m.id === modelId) : null;
        const provider = model ? providers.find(p => p.id === model.providerId && p.enabled) : null;

        if (!model || !provider) {
            setError('No API provider configured. Go to Settings to add one.');
            return;
        }

        // Placeholder streaming message
        const assistantMessage: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
        };
        addMessage(assistantMessage);
        setIsStreaming(true);

        try {
            const activeToolConfigs = searchEnabled
                ? toolConfigs.filter(c => c.enabled)
                : [];

            const result = await toolLoop({
                messages: priorMessages,
                settings,
                persona,
                provider,
                model,
                toolConfigs: activeToolConfigs,
                thinkingEnabled,
                onChunk: updateLastAssistantMessage,
                onThinkingChunk: updateStreamingThinking,
                onToolCall: (record) => {
                    addPendingToolCall(record);
                },
                onToolResult: (record) => {
                    updatePendingToolCall(record);
                },
                onRetry: (attempt, max) => setRetryInfo({ attempt, max }),
            });

            if (result.toolCalls.length > 0) {
                updateLastToolCalls(result.toolCalls);
            }
            await finaliseMessage(result.content, result.thinking, result.knowledgeSources);

            // Memory: count turn and check if detection is due
            if (personaId && persona.memoryEnabled !== false) {
                incrementTurnCount(personaId);
                const turns = (useAppStore.getState().turnsSinceLastDetection[personaId] ?? 0);
                const interval = settings.memorySettings.detectionInterval;
                if (shouldRunDetection(turns, interval)) {
                    const allMsgs = useAppStore.getState().activeChat?.messages ?? [];
                    triggerDetection(allMsgs);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setError(msg);
            // Remove placeholder on error
            updateLastAssistantMessage('_(error — see above)_');
        } finally {
            clearPendingToolCalls();
            setIsStreaming(false);
            setRetryInfo(null);
        }
    }, [persona, personaId, settings, modelConfigs, providers, addMessage, setIsStreaming, updateLastAssistantMessage, updateStreamingThinking, finaliseMessage, thinkingEnabled, searchEnabled, toolConfigs, addPendingToolCall, updatePendingToolCall, clearPendingToolCalls, updateLastToolCalls, incrementTurnCount, triggerDetection]);

    const handleSend = useCallback(async () => {
        if (!input.trim() || isStreaming || !persona || !activeChat || !settings) return;

        const userMessage: Message = {
            id: uuidv4(),
            role: 'user',
            content: input.trim(),
            timestamp: Date.now(),
        };

        setInput('');
        setError(null);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        addMessage(userMessage);

        const priorMessages = [...activeChat.messages, userMessage];
        await doSend(userMessage.content, priorMessages);
    }, [input, isStreaming, persona, activeChat, settings, addMessage, doSend]);

    const handleRegenerate = useCallback(async () => {
        if (isStreaming || !activeChat) return;
        const msgs = activeChat.messages;
        let lastUserIdx = -1;
        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'user') { lastUserIdx = i; break; }
        }
        if (lastUserIdx === -1) return;
        setError(null);
        removeLastAssistantMessage();
        await doSend(msgs[lastUserIdx].content, msgs.slice(0, lastUserIdx + 1));
    }, [isStreaming, activeChat, removeLastAssistantMessage, doSend]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionQuery !== null && e.key === 'Escape') {
            e.preventDefault();
            setMentionQuery(null);
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (!persona) {
        return (
            <div className="flex items-center justify-center h-full bg-[#07050c]">
                <div className="text-center">
                    <p className="text-[rgba(255,255,255,0.3)] font-mono text-xs mb-4">Persona not found.</p>
                    <button onClick={() => navigate('/')} className="text-[rgba(255,255,255,0.5)] underline text-sm">
                        Go back
                    </button>
                </div>
            </div>
        );
    }

    const messages = activeChat?.messages ?? [];

    // Filtered collection suggestions for #mention autocomplete
    const mentionSuggestions = mentionQuery !== null
        ? collections.filter(c => c.name.toLowerCase().includes(mentionQuery))
        : [];

    const lastUserMessageId = [...messages].reverse().find(m => m.role === 'user')?.id;
    const lastAssistantId = [...messages].reverse().find(m => m.role === 'assistant')?.id;

    // Resolve active model to decide whether to show the thinking toggle
    const activeModelId = persona.modelId ?? settings?.defaultModelId;
    const activeModel = activeModelId ? modelConfigs.find(m => m.id === activeModelId) : null;
    const cotAvailable = !!activeModel && (activeModel.supportsCot || !!activeModel.cotSlug);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                background: '#07050c',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Memory sidebar — overlays chat from left */}
            <MemorySidebar
                entries={suggestedEntries}
                personaColor={persona.color}
                isOpen={sidebarOpen}
                isPulsing={isBadgePulsing}
                onMouseEnter={handleSidebarMouseEnter}
                onMouseLeave={handleSidebarMouseLeave}
                onToggle={() => setSidebarOpen(v => !v)}
                onAccept={handleAcceptEntry}
                onAcceptAll={handleAcceptAll}
                onDismiss={handleDismissEntry}
                onDismissAll={handleDismissAll}
                onEdit={handleEditEntry}
            />
            {/* Header */}
            <div
                style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(20px)',
                    background: 'rgba(7,5,12,0.9)',
                }}
            >
                <button
                    onClick={() => navigate('/')}
                    style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center' }}
                    aria-label="Back"
                >
                    ←
                </button>

                {/* Avatar — click to open persona page */}
                <button
                    onClick={() => navigate(`/persona/${personaId}`)}
                    aria-label={`Open ${persona.name} settings`}
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: persona.gradient,
                        border: `1px solid ${persona.color}44`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontFamily: "'Instrument Serif', Georgia, serif",
                        color: persona.color,
                        boxShadow: `0 0 10px ${persona.glow}`,
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 18px ${persona.glow}`;
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 10px ${persona.glow}`;
                    }}
                >
                    {persona.avatarUrl ? (
                        <img src={persona.avatarUrl} alt={persona.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                        persona.name[0]
                    )}
                </button>

                <div>
                    <div style={{ fontSize: 15, fontFamily: "'Instrument Serif', Georgia, serif", color: '#ffffff' }}>
                        {persona.name}
                    </div>
                    <div style={{ fontSize: 10, color: persona.color, letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace", opacity: 0.8 }}>
                        {persona.tagline}
                    </div>
                </div>

                {suggestedEntries.length > 0 && (
                    <button
                        onClick={() => navigate(`/persona/${personaId}`)}
                        style={{
                            marginLeft: 'auto',
                            padding: '3px 10px',
                            borderRadius: 20,
                            border: `1px solid ${persona.color}55`,
                            background: `${persona.color}22`,
                            color: persona.color,
                            fontSize: 11,
                            fontFamily: "'Courier New', monospace",
                            cursor: 'pointer',
                            animation: isBadgePulsing ? 'memoryPulse 0.8s ease-out' : 'none',
                            '--pulse-color': `${persona.color}99`,
                            '--pulse-color-fade': `${persona.color}00`,
                        } as React.CSSProperties}
                    >
                        💾 {suggestedEntries.length}
                    </button>
                )}
            </div>

            {/* Messages */}
            <div
                className="chat-scroll"
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    scrollbarWidth: 'thin',
                    scrollbarColor: `${persona.color}66 transparent`,
                    '--scrollbar-thumb': `${persona.color}66`,
                    '--scrollbar-thumb-hover': `${persona.color}bb`,
                } as React.CSSProperties}
            >
                <div
                    style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}
                >
                    {messages.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.15)', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontSize: 14, marginTop: 60 }}>
                            Begin the conversation…
                        </div>
                    )}

                    {messages.map((msg) => {
                        const isLastAssistant = msg.role === 'assistant' && msg.id === lastAssistantId;
                        if (msg.role === 'assistant') {
                            return (
                                <AssistantBubble
                                    key={msg.id}
                                    message={msg}
                                    persona={persona}
                                    isStreaming={isStreaming && isLastAssistant}
                                    streamingThinking={isStreaming && isLastAssistant ? streamingThinking : undefined}
                                    thinkingBlockOpen={thinkingBlockOpen}
                                    onThinkingToggle={setThinkingBlockOpen}
                                    pendingToolCalls={isStreaming && isLastAssistant ? pendingToolCalls : undefined}
                                    retryInfo={isStreaming && isLastAssistant ? retryInfo ?? undefined : undefined}
                                />
                            );
                        }
                        if (msg.role === 'user') {
                            return (
                                <UserBubble
                                    key={msg.id}
                                    message={msg}
                                    accentColor={persona.color}
                                    isLast={msg.id === lastUserMessageId}
                                    onRegenerate={handleRegenerate}
                                    regenerateDisabled={isStreaming}
                                />
                            );
                        }
                        return null;
                    })}

                    {/* Error message */}
                    {error && (
                        <div style={{ fontSize: 12, color: '#ff6b6b', fontFamily: "'Courier New', monospace", padding: '8px 12px', background: 'rgba(255,0,0,0.05)', border: '1px solid rgba(255,0,0,0.15)', borderRadius: 8 }}>
                            {error}
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input area */}
            <div
                style={{
                    flexShrink: 0,
                    padding: '12px 16px',
                    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(7,5,12,0.95)',
                    backdropFilter: 'blur(20px)',
                }}
            >
                <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative' }} ref={inputWrapperRef}>
                    {/* Rising detection bubble */}
                    {detectionBubble && (
                        <div
                            style={{
                                position: 'absolute',
                                bottom: '100%',
                                left: 0,
                                right: 0,
                                display: 'flex',
                                justifyContent: 'center',
                                pointerEvents: 'none',
                                zIndex: 10,
                                paddingBottom: 6,
                            }}
                        >
                            <button
                                onClick={() => { setSidebarOpen(true); setDetectionBubble(null); }}
                                style={{
                                    animation: 'bubbleRise 3s ease-out forwards',
                                    padding: '5px 12px',
                                    borderRadius: 20,
                                    border: `1px solid ${persona.color}55`,
                                    background: `rgba(7,5,12,0.92)`,
                                    color: persona.color,
                                    fontSize: 12,
                                    fontFamily: "'Courier New', monospace",
                                    letterSpacing: '0.06em',
                                    cursor: 'pointer',
                                    backdropFilter: 'blur(8px)',
                                    pointerEvents: 'auto',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {(Object.entries(detectionBubble) as [MemoryType, number][])
                                    .filter(([, n]) => n > 0)
                                    .map(([type, n]) => `${MEMORY_TYPE_EMOJI[type]} ×${n}`)
                                    .join('  ·  ')}
                            </button>
                        </div>
                    )}
                    {/* Memory suggestion popup */}
                    {suggestedEntries.length > 0 && (
                        <MemorySuggestion
                            entries={suggestedEntries}
                            personaColor={persona.color}
                            onAccept={handleAcceptEntry}
                            onAcceptAll={handleAcceptAll}
                            onDismiss={handleDismissEntry}
                            onDismissAll={handleDismissAll}
                            onEdit={handleEditEntry}
                        />
                    )}
                    {/* #mention autocomplete dropdown — shown above input */}
                    {mentionSuggestions.length > 0 && (
                        <div
                            style={{
                                marginBottom: 6,
                                background: 'rgba(15,12,22,0.97)',
                                border: `1px solid ${persona.color}44`,
                                borderRadius: 12,
                                overflow: 'hidden',
                                boxShadow: `0 -4px 20px rgba(0,0,0,0.4)`,
                            }}
                        >
                            {mentionSuggestions.map(c => (
                                <button
                                    key={c.id}
                                    onMouseDown={e => { e.preventDefault(); insertMention(c.name); }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 14px',
                                        background: 'none',
                                        border: 'none',
                                        borderBottom: `1px solid rgba(255,255,255,0.04)`,
                                        color: '#e8e0d4',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        fontSize: 13,
                                        fontFamily: "'Courier New', monospace",
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = `${persona.color}18`)}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                >
                                    <span style={{ color: persona.color }}>#</span>
                                    <span style={{ flex: 1, marginLeft: 4 }}>{c.name}</span>
                                    {c.description && (
                                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginLeft: 8 }}>
                                            {c.description}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            background: 'rgba(255,255,255,0.04)',
                            border: `1px solid ${isDetecting ? persona.color + '88' : persona.color + '33'}`,
                            borderRadius: 20,
                            padding: '8px 8px 8px 16px',
                        }}
                    >
                        {isDetecting && (
                            <span
                                style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    background: persona.color,
                                    flexShrink: 0,
                                    animation: 'pulse 1s ease-in-out infinite',
                                }}
                            />
                        )}
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            disabled={isStreaming}
                            placeholder="Write something…"
                            rows={1}
                            style={{
                                flex: 1,
                                background: 'none',
                                border: 'none',
                                outline: 'none',
                                color: '#e8e0d4',
                                fontSize: 14,
                                fontFamily: "var(--ss-chat-font-family, 'Lora', Georgia, serif)",
                                lineHeight: 1.6,
                                resize: 'none',
                                overflow: 'auto',
                                paddingTop: 6,
                                paddingBottom: 6,
                            }}
                        />

                        {/* Thinking toggle — only shown when model supports CoT */}
                        {cotAvailable && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                                <button
                                    onClick={() => setThinkingEnabled(v => !v)}
                                    title={thinkingEnabled ? 'Thinking on — click to disable' : 'Thinking off — click to enable'}
                                    style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 14,
                                        border: thinkingEnabled
                                            ? `1.5px solid ${persona.color}88`
                                            : '1.5px solid rgba(255,255,255,0.12)',
                                        background: thinkingEnabled
                                            ? `${persona.color}33`
                                            : 'rgba(255,255,255,0.06)',
                                        color: thinkingEnabled
                                            ? persona.color
                                            : 'rgba(255,255,255,0.35)',
                                        cursor: 'pointer',
                                        fontSize: 18,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s ease',
                                        boxShadow: thinkingEnabled ? `0 0 12px ${persona.color}44` : 'none',
                                    }}
                                    aria-label="Toggle thinking"
                                    aria-pressed={thinkingEnabled}
                                >
                                    ✦
                                </button>
                                <span style={{ fontSize: 9, fontWeight: 600, fontFamily: "'Courier New', monospace", letterSpacing: '0.1em', textTransform: 'uppercase', color: thinkingEnabled ? persona.color : 'rgba(255,255,255,0.3)', transition: 'color 0.2s' }}>think</span>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                            <button
                                onClick={handleSend}
                                disabled={isStreaming || !input.trim()}
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 14,
                                    border: input.trim() && !isStreaming
                                        ? `1.5px solid ${persona.color}88`
                                        : '1.5px solid rgba(255,255,255,0.12)',
                                    background: input.trim() && !isStreaming ? persona.color : 'rgba(255,255,255,0.06)',
                                    color: input.trim() && !isStreaming ? '#000000cc' : 'rgba(255,255,255,0.35)',
                                    cursor: input.trim() && !isStreaming ? 'pointer' : 'not-allowed',
                                    fontSize: 18,
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                    boxShadow: input.trim() && !isStreaming ? `0 0 12px ${persona.color}44` : 'none',
                                }}
                                aria-label="Send"
                            >
                                {isStreaming ? <TypingIndicator color={persona.color} /> : '↑'}
                            </button>
                            <span style={{ fontSize: 9, fontWeight: 600, fontFamily: "'Courier New', monospace", letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>send</span>
                        </div>
                    </div>
                    {/* Tool pills — shown below input when tools are available */}
                    {hasTools && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingLeft: 4 }}>
                            <button
                                onClick={() => setSearchEnabled(v => !v)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '7px 16px',
                                    borderRadius: 20,
                                    border: `1.5px solid ${searchEnabled ? persona.color + '88' : 'rgba(255,255,255,0.15)'}`,
                                    background: searchEnabled ? `${persona.color}28` : 'rgba(255,255,255,0.06)',
                                    color: searchEnabled ? persona.color : 'rgba(255,255,255,0.4)',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    fontFamily: "'Courier New', monospace",
                                    letterSpacing: '0.08em',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    boxShadow: searchEnabled ? `0 0 10px ${persona.color}33` : 'none',
                                }}
                                aria-pressed={searchEnabled}
                            >
                                <span style={{ fontSize: 13 }}>🔍</span>
                                Web Search
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Hearts animation on memory accept */}
            <FloatingHearts color={persona.color} trigger={showHearts} onComplete={() => setShowHearts(false)} />
        </div>
    );
}
