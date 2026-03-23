import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAppStore } from '@/stores/appStore';
import type { Chat } from '@/types';

export default function HistoryPage() {
    const { personas, loadChatsForPersona, removeChat } = useAppStore();
    const navigate = useNavigate();

    // Map personaId -> chats
    const [chatsByPersona, setChatsByPersona] = useState<Record<string, Chat[]>>({});
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            const result: Record<string, Chat[]> = {};
            await Promise.all(
                personas.map(async p => {
                    result[p.id] = await loadChatsForPersona(p.id);
                }),
            );
            setChatsByPersona(result);
        }
        if (personas.length > 0) load();
    }, [personas, loadChatsForPersona]);

    const handleDelete = async (chatId: string, personaId: string) => {
        await removeChat(chatId);
        setChatsByPersona(prev => ({
            ...prev,
            [personaId]: (prev[personaId] ?? []).filter(c => c.id !== chatId),
        }));
        setConfirmDelete(null);
    };

    return (
        <div style={{ minHeight: '100%', background: '#07050c', padding: '24px 16px' }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontFamily: "'Instrument Serif', Georgia, serif", color: '#ffffff', fontWeight: 400 }}>
                    History
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace" }}>
                    past conversations
                </p>
            </div>

            {personas.length === 0 && (
                <p style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontSize: 14 }}>
                    No personas yet.
                </p>
            )}

            {personas.map(persona => {
                const chats = chatsByPersona[persona.id] ?? [];
                if (chats.length === 0) return null;

                return (
                    <div key={persona.id} style={{ marginBottom: 32 }}>
                        {/* Persona group header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <div
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    background: persona.gradient,
                                    border: `1px solid ${persona.color}44`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 11,
                                    fontFamily: "'Instrument Serif', Georgia, serif",
                                    color: persona.color,
                                }}
                            >
                                {persona.name[0]}
                            </div>
                            <span style={{ fontSize: 13, color: persona.color, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace" }}>
                                {persona.name}
                            </span>
                        </div>

                        {/* Chat list */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {chats.map(chat => (
                                <div
                                    key={chat.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        padding: '12px 16px',
                                        borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        background: 'rgba(255,255,255,0.02)',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s',
                                    }}
                                    onClick={() => navigate(`/chat/${persona.id}/${chat.id}`)}
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

                                    {/* Delete button */}
                                    {confirmDelete === chat.id ? (
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={() => handleDelete(chat.id, persona.id)}
                                                style={{ fontSize: 10, color: '#ff6b6b', background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: "'Courier New', monospace" }}
                                            >
                                                delete
                                            </button>
                                            <button
                                                onClick={() => setConfirmDelete(null)}
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
                    </div>
                );
            })}
        </div>
    );
}
