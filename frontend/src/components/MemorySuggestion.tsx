import { useState } from 'react';
import type { MemoryPendingEntry } from '@/types';
import { MEMORY_TYPE_EMOJI } from '@/types';

interface MemorySuggestionProps {
    entries: MemoryPendingEntry[];
    personaColor: string;
    onAccept: (entry: MemoryPendingEntry) => void;
    onAcceptAll: () => void;
    onDismiss: (entryId: string) => void;
    onDismissAll: () => void;
    onEdit: (entryId: string, newContent: string) => void;
}

export default function MemorySuggestion({
    entries,
    personaColor,
    onAccept,
    onAcceptAll,
    onDismiss,
    onDismissAll,
    onEdit,
}: MemorySuggestionProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    function startEdit(entry: MemoryPendingEntry) {
        setEditingId(entry.id);
        setEditContent(entry.content);
    }

    function commitEdit(entryId: string) {
        if (editContent.trim()) {
            onEdit(entryId, editContent.trim());
        }
        setEditingId(null);
    }

    function handleEditKeyDown(e: React.KeyboardEvent, entryId: string) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commitEdit(entryId);
        }
        if (e.key === 'Escape') {
            setEditingId(null);
        }
    }

    return (
        <div
            style={{
                animation: 'slideUpFade 0.3s ease-out',
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${personaColor}33`,
                borderRadius: 16,
                padding: '12px 14px',
                marginBottom: 8,
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 10,
                    fontSize: 12,
                    fontFamily: "'Courier New', monospace",
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: personaColor,
                }}
            >
                <span style={{ fontSize: 14 }}>💾</span>
                Memory Detected
            </div>

            {/* Entries */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {entries.map(entry => (
                    <div
                        key={entry.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 8px',
                            borderRadius: 10,
                            background: 'rgba(255,255,255,0.02)',
                        }}
                    >
                        {/* Type emoji */}
                        <span style={{ fontSize: 14, flexShrink: 0 }}>
                            {MEMORY_TYPE_EMOJI[entry.type]}
                        </span>

                        {/* Content (editable) */}
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
                                    fontSize: 13,
                                    fontFamily: "'Lora', Georgia, serif",
                                    padding: '4px 8px',
                                    outline: 'none',
                                }}
                            />
                        ) : (
                            <span
                                onClick={() => startEdit(entry)}
                                title="Click to edit"
                                style={{
                                    flex: 1,
                                    fontSize: 13,
                                    fontFamily: "'Lora', Georgia, serif",
                                    color: '#e8e0d4',
                                    cursor: 'text',
                                    lineHeight: 1.4,
                                }}
                            >
                                {entry.content}
                            </span>
                        )}

                        {/* Accept / Dismiss buttons */}
                        <button
                            onClick={() => onAccept(entry)}
                            title="Save memory"
                            style={{
                                flexShrink: 0,
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                border: 'none',
                                background: `${personaColor}22`,
                                color: personaColor,
                                cursor: 'pointer',
                                fontSize: 14,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background 0.15s',
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
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                border: 'none',
                                background: 'rgba(255,255,255,0.04)',
                                color: 'rgba(255,255,255,0.3)',
                                cursor: 'pointer',
                                fontSize: 14,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background 0.15s',
                            }}
                            aria-label="Dismiss memory"
                        >
                            ✗
                        </button>
                    </div>
                ))}
            </div>

            {/* Batch actions */}
            {entries.length > 1 && (
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 8,
                        marginTop: 10,
                        paddingTop: 8,
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                    }}
                >
                    <button
                        onClick={onDismissAll}
                        style={{
                            padding: '5px 14px',
                            borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'transparent',
                            color: 'rgba(255,255,255,0.35)',
                            fontSize: 11,
                            fontFamily: "'Courier New', monospace",
                            letterSpacing: '0.06em',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        ✗ Dismiss All
                    </button>
                    <button
                        onClick={onAcceptAll}
                        style={{
                            padding: '5px 14px',
                            borderRadius: 10,
                            border: `1px solid ${personaColor}44`,
                            background: `${personaColor}18`,
                            color: personaColor,
                            fontSize: 11,
                            fontFamily: "'Courier New', monospace",
                            letterSpacing: '0.06em',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        ✓ Accept All
                    </button>
                </div>
            )}
        </div>
    );
}
