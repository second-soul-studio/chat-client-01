import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/stores/appStore';
import { sendMessage } from '@/services/api';
import { AssistantBubble, UserBubble, TypingIndicator } from './ChatBubbles';
import type { Message } from '@/types';

export default function ChatPage() {
    const { personaId, chatId } = useParams<{ personaId: string; chatId?: string }>();
    const navigate = useNavigate();

    const {
        personas, providers, modelConfigs, settings,
        activeChat, isStreaming,
        loadOrCreateChat, addMessage, updateLastAssistantMessage,
        finaliseMessage, setIsStreaming,
    } = useAppStore();

    const persona = personas.find(p => p.id === personaId);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [input, setInput] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Initialise chat
    useEffect(() => {
        if (personaId) {
            loadOrCreateChat(personaId, chatId);
        }
    }, [personaId, chatId, loadOrCreateChat]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeChat?.messages.length, isStreaming]);

    // Auto-resize textarea
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
    };

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

        // Resolve provider + model
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
            const result = await sendMessage({
                messages: [...activeChat.messages, userMessage],
                settings,
                persona,
                provider,
                model,
                onChunk: (content) => {
                    updateLastAssistantMessage(content);
                },
            });

            await finaliseMessage(result.content, result.thinking);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setError(msg);
            // Remove placeholder on error
            updateLastAssistantMessage('_(error — see above)_');
        } finally {
            setIsStreaming(false);
        }
    }, [input, isStreaming, persona, activeChat, settings, modelConfigs, providers, addMessage, updateLastAssistantMessage, finaliseMessage, setIsStreaming]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                background: '#07050c',
            }}
        >
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

                {/* Avatar */}
                <div
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
                    }}
                >
                    {persona.avatarUrl ? (
                        <img src={persona.avatarUrl} alt={persona.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                        persona.name[0]
                    )}
                </div>

                <div>
                    <div style={{ fontSize: 15, fontFamily: "'Instrument Serif', Georgia, serif", color: '#ffffff' }}>
                        {persona.name}
                    </div>
                    <div style={{ fontSize: 10, color: persona.color, letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace", opacity: 0.8 }}>
                        {persona.tagline}
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '24px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 20,
                }}
            >
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.15)', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontSize: 14, marginTop: 60 }}>
                        Begin the conversation…
                    </div>
                )}

                {messages.map((msg, i) => {
                    const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
                    if (msg.role === 'assistant') {
                        return (
                            <AssistantBubble
                                key={msg.id}
                                message={msg}
                                persona={persona}
                                isStreaming={isStreaming && isLastAssistant && msg.content === ''}
                            />
                        );
                    }
                    if (msg.role === 'user') {
                        return <UserBubble key={msg.id} message={msg} accentColor={persona.color} />;
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
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: 10,
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${persona.color}33`,
                        borderRadius: 20,
                        padding: '8px 8px 8px 16px',
                    }}
                >
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
                            fontFamily: "'Lora', Georgia, serif",
                            lineHeight: 1.6,
                            resize: 'none',
                            overflow: 'hidden',
                            paddingTop: 6,
                            paddingBottom: 6,
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={isStreaming || !input.trim()}
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            border: 'none',
                            background: input.trim() && !isStreaming ? persona.color : 'rgba(255,255,255,0.08)',
                            color: input.trim() && !isStreaming ? '#000000cc' : 'rgba(255,255,255,0.2)',
                            cursor: input.trim() && !isStreaming ? 'pointer' : 'not-allowed',
                            fontSize: 16,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                            flexShrink: 0,
                        }}
                        aria-label="Send"
                    >
                        {isStreaming ? <TypingIndicator color={persona.color} /> : '↑'}
                    </button>
                </div>
            </div>
        </div>
    );
}
