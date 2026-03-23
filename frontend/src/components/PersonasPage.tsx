import { useState } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { useAppStore } from '@/stores/appStore';
import { PersonaCard, AddPersonaCard } from './PersonaCard';
import PersonaFormModal from './PersonaFormModal';
import type { Persona } from '@/types';

// Background nebula blobs matching the mockup
const NEBULA_BLOBS = [
    { color: '#C9A96E', x: '20%', y: '30%', size: 400 },
    { color: '#9E8FD4', x: '75%', y: '20%', size: 350 },
    { color: '#7ABFB0', x: '60%', y: '70%', size: 300 },
    { color: '#D4706A', x: '15%', y: '65%', size: 280 },
];

export default function PersonasPage() {
    const { personas, removePersona, reorderPersonas } = useAppStore();
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

    const handleArchive = async (persona: Persona) => {
        await removePersona(persona.id);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = personas.findIndex(p => p.id === active.id);
        const newIndex = personas.findIndex(p => p.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const reordered = [...personas];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);
        await reorderPersonas(reordered.map(p => p.id));
    };

    // Show up to 4 empty slots cosmetically on first use
    const emptySlots = Math.max(0, 4 - personas.length);

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
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={personas.map(p => p.id)} strategy={rectSortingStrategy}>
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
                            <PersonaCard key={persona.id} id={persona.id} persona={persona} index={i} onEdit={openEdit} onArchive={handleArchive} />
                        ))}
                        {Array.from({ length: emptySlots }, (_, i) => (
                            <AddPersonaCard key={`empty-${i}`} index={personas.length + i} onClick={openCreate} />
                        ))}
                        {personas.length >= 4 && (
                            <AddPersonaCard index={personas.length} onClick={openCreate} />
                        )}
                    </div>
                </SortableContext>
            </DndContext>

            {modalOpen && (
                <PersonaFormModal
                    persona={editingPersona}
                    onClose={() => setModalOpen(false)}
                />
            )}
        </div>
    );
}
