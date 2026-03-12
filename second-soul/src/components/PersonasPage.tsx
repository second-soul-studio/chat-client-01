import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { PersonaCard, AddPersonaCard } from './PersonaCard';
import PersonaFormModal from './PersonaFormModal';
import type { Persona } from '@/types';

const MAX_PERSONAS = 4;

// Background nebula blobs matching the mockup
const NEBULA_BLOBS = [
    { color: '#C9A96E', x: '20%', y: '30%', size: 400 },
    { color: '#9E8FD4', x: '75%', y: '20%', size: 350 },
    { color: '#7ABFB0', x: '60%', y: '70%', size: 300 },
    { color: '#D4706A', x: '15%', y: '65%', size: 280 },
];

export default function PersonasPage() {
    const { personas } = useAppStore();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingPersona, setEditingPersona] = useState<Persona | null>(null);

    const openCreate = () => {
        setEditingPersona(null);
        setModalOpen(true);
    };

    const openEdit = (persona: Persona) => {
        setEditingPersona(persona);
        setModalOpen(true);
    };

    // Pad with empty slots up to MAX_PERSONAS
    const emptySlots = Math.max(0, MAX_PERSONAS - personas.length);

    return (
        <div
            style={{
                minHeight: '100%',
                background: '#07050c',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative',
                padding: '40px 20px',
            }}
        >
            {/* Background nebula */}
            <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                {NEBULA_BLOBS.map((blob, i) => (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            left: blob.x,
                            top: blob.y,
                            width: blob.size,
                            height: blob.size,
                            borderRadius: '50%',
                            background: `radial-gradient(circle, ${blob.color}0a 0%, transparent 70%)`,
                            transform: 'translate(-50%, -50%)',
                            animation: `nebulaFloat ${18 + i * 4}s ease-in-out infinite`,
                            animationDelay: `${i * 2}s`,
                        }}
                    />
                ))}
            </div>

            {/* Header */}
            <div
                style={{
                    textAlign: 'center',
                    marginBottom: 48,
                    animation: 'headerEntrance 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                <h1
                    style={{
                        fontSize: 32,
                        fontFamily: "'Instrument Serif', Georgia, serif",
                        color: '#ffffff',
                        margin: 0,
                        letterSpacing: '0.05em',
                        fontWeight: 400,
                    }}
                >
                    Second Soul
                </h1>
                <p
                    style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.3)',
                        letterSpacing: '0.3em',
                        textTransform: 'uppercase',
                        fontFamily: "'Courier New', monospace",
                        marginTop: 8,
                        marginBottom: 0,
                    }}
                >
                    your companions
                </p>
            </div>

            {/* Persona cards grid */}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 24,
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                {personas.map((persona, i) => (
                    <PersonaCard key={persona.id} persona={persona} index={i} onEdit={openEdit} />
                ))}
                {Array.from({ length: emptySlots }, (_, i) => (
                    <AddPersonaCard key={`empty-${i}`} index={personas.length + i} onClick={openCreate} />
                ))}
            </div>

            {modalOpen && (
                <PersonaFormModal
                    persona={editingPersona}
                    onClose={() => setModalOpen(false)}
                />
            )}
        </div>
    );
}
