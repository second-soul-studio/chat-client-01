import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Persona } from '@/types';

const MENU_ITEMS = [
    { icon: '✦', label: 'Customise', sub: 'appearance & voice' },
    { icon: '◎', label: 'Nostalgia', sub: 'memory & history' },
    { icon: '⟡', label: 'Persona', sub: 'edit character' },
    { icon: '⊹', label: 'Archive', sub: 'saved moments' },
] as const;

// ─── Sub-components ────────────────────────────────────────────────────────────

function BreathingOrb({ glow, active }: { glow: string; active: boolean }) {
    return (
        <div
            style={{
                position: 'absolute',
                inset: -20,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
                animation: active ? 'breathe 3s ease-in-out infinite' : 'breatheSlow 6s ease-in-out infinite',
                pointerEvents: 'none',
            }}
        />
    );
}

function FloatingParticles({ color, active }: { color: string; active: boolean }) {
    const particles = [0, 1, 2, 3, 4, 5];
    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                overflow: 'hidden',
                borderRadius: 24,
                pointerEvents: 'none',
            }}
        >
            {particles.map(i => (
                <div
                    key={i}
                    style={{
                        position: 'absolute',
                        width: 3,
                        height: 3,
                        borderRadius: '50%',
                        background: color,
                        opacity: active ? 0.7 : 0.2,
                        left: `${15 + i * 13}%`,
                        bottom: '20%',
                        animation: `float${i % 3} ${3 + i * 0.7}s ease-in-out infinite`,
                        animationDelay: `${i * 0.4}s`,
                    }}
                />
            ))}
        </div>
    );
}

function ContextMenu({
    persona,
    menuRef,
    onClose,
    onEdit,
}: {
    persona: Persona;
    menuRef: React.RefObject<HTMLDivElement | null>;
    onClose: () => void;
    onEdit: () => void;
}) {
    const [visible, setVisible] = useState(false);
    const [hovered, setHovered] = useState<number | null>(null);

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true));
    }, []);

    return (
        <div
            ref={menuRef}
            style={{
                position: 'absolute',
                bottom: 'calc(100% + 12px)',
                left: '50%',
                transform: `translateX(-50%) translateY(${visible ? 0 : 10}px)`,
                opacity: visible ? 1 : 0,
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                zIndex: 100,
                minWidth: 200,
                background: 'rgba(10, 8, 14, 0.95)',
                border: `1px solid ${persona.color}33`,
                borderRadius: 16,
                padding: '8px 0',
                backdropFilter: 'blur(20px)',
                boxShadow: `0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px ${persona.color}22, inset 0 1px 0 ${persona.color}11`,
            }}
            onClick={e => e.stopPropagation()}
        >
            {/* Persona label */}
            <div
                style={{
                    padding: '8px 16px 12px',
                    borderBottom: `1px solid ${persona.color}22`,
                    marginBottom: 4,
                }}
            >
                <div style={{ fontSize: 11, color: persona.color, letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace" }}>
                    {persona.name}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{persona.tagline}</div>
            </div>

            {MENU_ITEMS.map((item, i) => (
                <div
                    key={i}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                        // Customise (0) and Persona (2) open the edit form
                        if (i === 0 || i === 2) { onEdit(); }
                        onClose();
                    }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 16px',
                        cursor: 'pointer',
                        background: hovered === i ? `${persona.color}12` : 'transparent',
                        transition: 'background 0.15s',
                    }}
                >
                    <span style={{ color: persona.color, fontSize: 14, width: 16, textAlign: 'center' }}>{item.icon}</span>
                    <div>
                        <div style={{ fontSize: 13, color: hovered === i ? '#ffffff' : 'rgba(255,255,255,0.8)', fontFamily: "'Instrument Serif', Georgia, serif", transition: 'color 0.15s' }}>
                            {item.label}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>{item.sub}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── PersonaCard ──────────────────────────────────────────────────────────────

interface PersonaCardProps {
    persona: Persona;
    index: number;
    onEdit?: (persona: Persona) => void;
}

export function PersonaCard({ persona, index, onEdit }: PersonaCardProps) {
    const navigate = useNavigate();
    const [hovered, setHovered] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [talkPressed, setTalkPressed] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (
                menuOpen &&
                menuRef.current &&
                cardRef.current &&
                !menuRef.current.contains(e.target as Node) &&
                !cardRef.current.contains(e.target as Node)
            ) {
                setMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpen]);

    const handleCardClick = (e: React.MouseEvent) => {
        if ((e.target as Element).closest('[data-talk]')) return;
        setMenuOpen(prev => !prev);
    };

    const handleTalk = (e: React.MouseEvent) => {
        e.stopPropagation();
        setTalkPressed(true);
        setTimeout(() => {
            setTalkPressed(false);
            navigate(`/chat/${persona.id}`);
        }, 150);
    };

    return (
        <div
            ref={cardRef}
            onClick={handleCardClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                position: 'relative',
                width: 200,
                height: 280,
                borderRadius: 24,
                background: persona.gradient,
                border: `1px solid ${hovered || menuOpen ? persona.color + '60' : persona.color + '22'}`,
                cursor: 'pointer',
                transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                transform: hovered ? 'translateY(-8px) scale(1.02)' : 'translateY(0) scale(1)',
                boxShadow: hovered || menuOpen
                    ? `0 30px 60px rgba(0,0,0,0.6), 0 0 40px ${persona.glow}, inset 0 1px 0 ${persona.color}30`
                    : `0 10px 30px rgba(0,0,0,0.4), inset 0 1px 0 ${persona.color}15`,
                animation: 'cardEntrance 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
                animationDelay: `${index * 0.15}s`,
                overflow: 'visible',
                flexShrink: 0,
            }}
        >
            <BreathingOrb glow={persona.glow} active={hovered} />
            <FloatingParticles color={persona.color} active={hovered} />

            {/* Online indicator */}
            {persona.online && (
                <div
                    style={{
                        position: 'absolute',
                        top: 14,
                        right: 14,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: persona.color,
                        boxShadow: `0 0 8px ${persona.color}`,
                        animation: 'pulse 2s ease-in-out infinite',
                    }}
                />
            )}

            {/* Avatar circle */}
            <div
                style={{
                    position: 'absolute',
                    top: 36,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 90,
                    height: 90,
                    borderRadius: '50%',
                    background: `radial-gradient(circle at 35% 35%, ${persona.color}44 0%, ${persona.color}11 60%, transparent 100%)`,
                    border: `2px solid ${persona.color}55`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: hovered
                        ? `0 0 30px ${persona.glow}, inset 0 0 20px ${persona.color}22`
                        : `0 0 15px ${persona.glow}`,
                    transition: 'all 0.4s ease',
                }}
            >
                {persona.avatarUrl ? (
                    <img
                        src={persona.avatarUrl}
                        alt={persona.name}
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                    />
                ) : (
                    <span
                        style={{
                            fontSize: 36,
                            fontFamily: "'Instrument Serif', Georgia, serif",
                            color: persona.color,
                            opacity: 0.9,
                            textShadow: `0 0 20px ${persona.color}`,
                        }}
                    >
                        {persona.name[0]}
                    </span>
                )}

                {/* Inner ring animation */}
                <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `1px solid ${persona.color}30`, animation: 'spinSlow 8s linear infinite' }} />
                <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: `1px solid ${persona.color}15`, animation: 'spinSlow 12s linear infinite reverse' }} />
            </div>

            {/* Name & tagline */}
            <div style={{ position: 'absolute', bottom: 72, left: 0, right: 0, textAlign: 'center', padding: '0 16px' }}>
                <div style={{ fontSize: 22, fontFamily: "'Instrument Serif', Georgia, serif", color: '#ffffff', letterSpacing: '0.02em', textShadow: `0 0 20px ${persona.color}66` }}>
                    {persona.name}
                </div>
                <div style={{ fontSize: 10, color: persona.color, letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4, opacity: 0.8, fontFamily: "'Courier New', monospace" }}>
                    {persona.tagline}
                </div>
            </div>

            {/* Talk button */}
            <div
                data-talk="true"
                onClick={handleTalk}
                style={{
                    position: 'absolute',
                    bottom: 16,
                    left: '50%',
                    transform: `translateX(-50%) scale(${talkPressed ? 0.95 : 1})`,
                    transition: 'transform 0.1s ease, background 0.2s ease',
                    background: talkPressed ? persona.color : `${persona.color}22`,
                    border: `1px solid ${persona.color}66`,
                    borderRadius: 20,
                    padding: '8px 28px',
                    cursor: 'pointer',
                    color: talkPressed ? '#000000cc' : persona.color,
                    fontSize: 11,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    fontFamily: "'Courier New', monospace",
                    whiteSpace: 'nowrap',
                    backdropFilter: 'blur(10px)',
                    minWidth: 44,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                talk
            </div>

            {/* Context menu */}
            {menuOpen && (
                <ContextMenu
                    persona={persona}
                    menuRef={menuRef}
                    onClose={() => setMenuOpen(false)}
                    onEdit={() => { onEdit?.(persona); setMenuOpen(false); }}
                />
            )}
        </div>
    );
}

// ─── Add Persona Card ─────────────────────────────────────────────────────────

export function AddPersonaCard({ index, onClick }: { index: number; onClick?: () => void }) {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                width: 200,
                height: 280,
                borderRadius: 24,
                border: `1px dashed ${hovered ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
                animation: 'cardEntrance 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
                animationDelay: `${index * 0.15}s`,
                flexShrink: 0,
            }}
        >
            <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.2)' }}>+</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace" }}>
                add persona
            </div>
        </div>
    );
}
