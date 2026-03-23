import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Persona } from '@/types';
import type { Message } from '@/types';

// ─── Typing Indicator ─────────────────────────────────────────────────────────

export function TypingIndicator({ color }: { color: string }) {
    return (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '4px 2px' }}>
            {[0, 1, 2].map(i => (
                <div
                    key={i}
                    style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: color,
                        animation: 'typingBounce 1.2s ease-in-out infinite',
                        animationDelay: `${i * 0.2}s`,
                        opacity: 0.7,
                    }}
                />
            ))}
        </div>
    );
}

// ─── Thinking Block ───────────────────────────────────────────────────────────

export function ThinkingBlock({ thinking, color }: { thinking: string; color: string }) {
    const [open, setOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        if (contentRef.current) {
            setHeight(open ? contentRef.current.scrollHeight : 0);
        }
    }, [open]);

    return (
        <div style={{ marginBottom: 8 }}>
            {/* Toggle button */}
            <div
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    cursor: 'pointer',
                    userSelect: 'none',
                    padding: '5px 12px 5px 8px',
                    borderRadius: 20,
                    border: `1px solid ${open ? color + '44' : 'rgba(255,255,255,0.08)'}`,
                    background: open ? `${color}0e` : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.2s ease',
                }}
            >
                {/* Brain icon */}
                <div style={{ width: 16, height: 16, position: 'relative', flexShrink: 0 }}>
                    {[0, 1, 2].map(i => (
                        <div
                            key={i}
                            style={{
                                position: 'absolute',
                                width: 3,
                                height: 3,
                                borderRadius: '50%',
                                background: color,
                                opacity: open ? 0.9 : 0.4,
                                top: i === 1 ? '50%' : i === 0 ? '15%' : '75%',
                                left: i === 0 ? '20%' : i === 1 ? '65%' : '35%',
                                transform: 'translate(-50%, -50%)',
                                animation: open ? 'thinkPulse 1.5s ease-in-out infinite' : 'none',
                                animationDelay: `${i * 0.3}s`,
                                transition: 'opacity 0.2s',
                            }}
                        />
                    ))}
                    <svg
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: open ? 0.5 : 0.15, transition: 'opacity 0.2s' }}
                        viewBox="0 0 16 16"
                    >
                        <line x1="3" y1="2" x2="10" y2="8" stroke={color} strokeWidth="0.8" />
                        <line x1="10" y1="8" x2="6" y2="13" stroke={color} strokeWidth="0.8" />
                        <line x1="3" y1="2" x2="6" y2="13" stroke={color} strokeWidth="0.8" />
                    </svg>
                </div>

                <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace", color: open ? color : 'rgba(255,255,255,0.3)', transition: 'color 0.2s' }}>
                    Gedanken
                </span>

                <span style={{ fontSize: 8, color: open ? color : 'rgba(255,255,255,0.2)', transition: 'transform 0.25s ease, color 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', marginLeft: 2 }}>
                    ▼
                </span>
            </div>

            {/* Collapsible content — explicit px height, not auto */}
            <div style={{ overflow: 'hidden', height, transition: 'height 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                <div
                    ref={contentRef}
                    style={{
                        marginTop: 8,
                        padding: '12px 16px',
                        background: `linear-gradient(135deg, ${color}08 0%, rgba(255,255,255,0.02) 100%)`,
                        border: `1px solid ${color}22`,
                        borderLeft: `2px solid ${color}55`,
                        borderRadius: '4px 12px 12px 12px',
                        boxShadow: `inset 0 1px 0 ${color}11`,
                    }}
                >
                    <div style={{ fontSize: 9, color, opacity: 0.6, letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace", marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: color, animation: 'thinkPulse 2s ease-in-out infinite' }} />
                        interner monolog
                    </div>
                    <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.38)', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', lineHeight: 1.75, whiteSpace: 'pre-line' }}>
                        {thinking}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Assistant Bubble ─────────────────────────────────────────────────────────

export function AssistantBubble({ message, persona, isStreaming }: { message: Message; persona: Persona; isStreaming?: boolean }) {
    return (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', maxWidth: '85%' }}>
            {/* Avatar */}
            <div
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: persona.gradient,
                    border: `1px solid ${persona.color}44`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 0 12px ${persona.glow}`,
                    fontSize: 14,
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    color: persona.color,
                    marginTop: 2,
                }}
            >
                {persona.avatarUrl ? (
                    <img src={persona.avatarUrl} alt={persona.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                    persona.name[0]
                )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Thinking block — only when present and not streaming */}
                {message.thinking && !isStreaming && persona.showThinking && (
                    <ThinkingBlock thinking={message.thinking} color={persona.color} />
                )}

                {/* Bubble */}
                <div
                    style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '4px 20px 20px 20px',
                        padding: '14px 18px',
                        color: '#e8e0d4',
                        fontSize: 14.5,
                        fontFamily: "'Lora', Georgia, serif",
                        lineHeight: 1.65,
                        backdropFilter: 'blur(10px)',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
                        position: 'relative',
                    }}
                >
                    {isStreaming ? (
                        <TypingIndicator color={persona.color} />
                    ) : (
                        <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                    )}

                    {/* Left accent */}
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 12,
                            bottom: 12,
                            width: 2,
                            borderRadius: 2,
                            background: `linear-gradient(to bottom, ${persona.color}88, transparent)`,
                        }}
                    />
                </div>

                <div style={{ marginTop: 4, marginLeft: 6, fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: "'Courier New', monospace", letterSpacing: '0.05em' }}>
                    {persona.name} · {new Date(message.timestamp).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>
        </div>
    );
}

// ─── User Bubble ──────────────────────────────────────────────────────────────

export function UserBubble({ message, accentColor }: { message: Message; accentColor: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ maxWidth: '78%' }}>
                <div
                    style={{
                        background: `linear-gradient(135deg, ${accentColor}22 0%, ${accentColor}12 100%)`,
                        border: `1px solid ${accentColor}33`,
                        borderRadius: '20px 4px 20px 20px',
                        padding: '12px 16px',
                        color: '#e8e0d4',
                        fontSize: 14.5,
                        fontFamily: "'Lora', Georgia, serif",
                        lineHeight: 1.65,
                    }}
                >
                    <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                </div>
                <div style={{ marginTop: 4, marginRight: 6, textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: "'Courier New', monospace", letterSpacing: '0.05em' }}>
                    {new Date(message.timestamp).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>
        </div>
    );
}
