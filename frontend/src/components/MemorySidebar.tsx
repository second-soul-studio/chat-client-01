import { useState } from 'react';
import type { MemoryPendingEntry } from '@/types';
import { MEMORY_TYPE_EMOJI } from '@/types';

interface MemorySidebarProps {
    entries: MemoryPendingEntry[];
    personaColor: string;
    isOpen: boolean;
    isPulsing: boolean;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onToggle: () => void;
    onAccept: (entry: MemoryPendingEntry) => void;
    onAcceptAll: () => void;
    onDismiss: (entryId: string) => void;
    onDismissAll: () => void;
    onEdit: (entryId: string, newContent: string) => void;
}

export default function MemorySidebar({
    entries, personaColor, isOpen, isPulsing,
    onMouseEnter, onMouseLeave, onToggle,
    onAccept, onAcceptAll, onDismiss, onDismissAll, onEdit,
}: MemorySidebarProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    function startEdit(entry: MemoryPendingEntry) {
        setEditingId(entry.id);
        setEditContent(entry.content);
    }

    function commitEdit(entryId: string) {
        if (editContent.trim()) onEdit(entryId, editContent.trim());
        setEditingId(null);
    }

    function handleEditKeyDown(e: React.KeyboardEvent, entryId: string) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(entryId); }
        if (e.key === 'Escape') setEditingId(null);
    }

    return (
        <div
            style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 320,
                transform: isOpen ? 'translateX(0)' : 'translateX(calc(-100% + 32px))',
                transition: 'transform 0.25s ease',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {/* Panel content — fades in/out, hides behind handle when closed */}
            <div
                style={{
                    flex: 1,
                    background: 'rgba(7,5,12,0.97)',
                    backdropFilter: 'blur(20px)',
                    borderRight: `1px solid ${personaColor}33`,
                    display: 'flex',
                    flexDirection: 'column',
                    opacity: isOpen ? 1 : 0,
                    transition: 'opacity 0.15s ease',
                    pointerEvents: isOpen ? 'auto' : 'none',
                    paddingRight: 32,
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '16px 14px 10px',
                        fontSize: 11,
                        fontFamily: "'Courier New', monospace",
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: personaColor,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexShrink: 0,
                    }}
                >
                    <span style={{ fontSize: 14 }}>💾</span>
                    Pending Memories
                </div>

                {/* Entry list */}
                <div
                    style={{
                        flex: 1,
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        overflowY: 'auto',
                        scrollbarWidth: 'thin',
                        scrollbarColor: `${personaColor}44 transparent`,
                    }}
                >
                    {entries.length === 0 ? (
                        <div
                            style={{
                                color: 'rgba(255,255,255,0.25)',
                                fontSize: 12,
                                fontFamily: "'Lora', Georgia, serif",
                                fontStyle: 'italic',
                                textAlign: 'center',
                                marginTop: 20,
                            }}
                        >
                            No pending memories
                        </div>
                    ) : (
                        entries.map(entry => (
                            <div
                                key={entry.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 8px',
                                    borderRadius: 10,
                                    background: 'rgba(255,255,255,0.02)',
                                }}
                            >
                                <span style={{ fontSize: 14, flexShrink: 0 }}>
                                    {MEMORY_TYPE_EMOJI[entry.type]}
                                </span>

                                {editingId === entry.id ? (
                                    <input
                                        autoFocus
                                        value={editContent}
                                        onChange={e => setEditContent(e.target.value)}
                                        onKeyDown={e => handleEditKeyDown(e, entry.id)}
                                        onBlur={() => commitEdit(entry.id)}
                                        style={{
                                            flex: 1,
                                            background: 'rgba(255,255,255,0.06)',
                                            border: `1px solid ${personaColor}44`,
                                            borderRadius: 6,
                                            color: '#e8e0d4',
                                            fontSize: 12,
                                            fontFamily: "'Lora', Georgia, serif",
                                            padding: '3px 6px',
                                            outline: 'none',
                                        }}
                                    />
                                ) : (
                                    <span
                                        onClick={() => startEdit(entry)}
                                        title="Click to edit"
                                        style={{
                                            flex: 1,
                                            fontSize: 12,
                                            fontFamily: "'Lora', Georgia, serif",
                                            color: '#e8e0d4',
                                            cursor: 'text',
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        {entry.content}
                                    </span>
                                )}

                                <button
                                    onClick={() => onAccept(entry)}
                                    title="Accept"
                                    style={{
                                        flexShrink: 0,
                                        width: 24,
                                        height: 24,
                                        borderRadius: 6,
                                        border: 'none',
                                        background: `${personaColor}22`,
                                        color: personaColor,
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    aria-label="Accept memory"
                                >
                                    ✓
                                </button>
                                <button
                                    onClick={() => onDismiss(entry.id)}
                                    title="Dismiss"
                                    style={{
                                        flexShrink: 0,
                                        width: 24,
                                        height: 24,
                                        borderRadius: 6,
                                        border: 'none',
                                        background: 'rgba(255,255,255,0.04)',
                                        color: 'rgba(255,255,255,0.3)',
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    aria-label="Dismiss memory"
                                >
                                    ✗
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Batch actions */}
                {entries.length > 1 && (
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 6,
                            padding: '8px 10px',
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            flexShrink: 0,
                        }}
                    >
                        <button
                            onClick={onDismissAll}
                            style={{
                                padding: '4px 10px',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'transparent',
                                color: 'rgba(255,255,255,0.35)',
                                fontSize: 10,
                                fontFamily: "'Courier New', monospace",
                                letterSpacing: '0.06em',
                                cursor: 'pointer',
                            }}
                        >
                            ✗ All
                        </button>
                        <button
                            onClick={onAcceptAll}
                            style={{
                                padding: '4px 10px',
                                borderRadius: 8,
                                border: `1px solid ${personaColor}44`,
                                background: `${personaColor}18`,
                                color: personaColor,
                                fontSize: 10,
                                fontFamily: "'Courier New', monospace",
                                letterSpacing: '0.06em',
                                cursor: 'pointer',
                            }}
                        >
                            ✓ All
                        </button>
                    </div>
                )}
            </div>

            {/* Tab handle — always visible at right edge of the outer div */}
            <button
                onClick={onToggle}
                style={{
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 28,
                    padding: '20px 0',
                    background: isOpen ? `${personaColor}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isOpen ? personaColor + '55' : 'rgba(255,255,255,0.12)'}`,
                    borderLeft: 'none',
                    borderRadius: '0 10px 10px 0',
                    color: isOpen ? personaColor : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 14,
                    transition: 'all 0.2s ease',
                    animation: isPulsing ? 'memoryPulse 0.8s ease-out' : 'none',
                    '--pulse-color': `${personaColor}99`,
                    '--pulse-color-fade': `${personaColor}00`,
                } as React.CSSProperties}
                aria-label={isOpen ? 'Close memory sidebar' : 'Open memory sidebar'}
            >
                💾
                {entries.length > 0 && (
                    <span
                        style={{
                            fontSize: 9,
                            fontFamily: "'Courier New', monospace",
                            fontWeight: 700,
                            color: personaColor,
                            lineHeight: 1,
                        }}
                    >
                        {entries.length}
                    </span>
                )}
            </button>
        </div>
    );
}
