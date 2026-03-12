import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import type { Persona } from '@/types';

// ─── Colour Palettes ──────────────────────────────────────────────────────────

const PALETTES = [
    {
        name: 'Amber',
        color: '#C9A96E',
        glow: 'rgba(201,169,110,0.3)',
        gradient: 'linear-gradient(135deg, #1a1208 0%, #0d0b05 100%)',
    },
    {
        name: 'Violet',
        color: '#9E8FD4',
        glow: 'rgba(158,143,212,0.3)',
        gradient: 'linear-gradient(135deg, #100e1a 0%, #07060f 100%)',
    },
    {
        name: 'Teal',
        color: '#7ABFB0',
        glow: 'rgba(122,191,176,0.3)',
        gradient: 'linear-gradient(135deg, #081410 0%, #050d0c 100%)',
    },
    {
        name: 'Rose',
        color: '#D4706A',
        glow: 'rgba(212,112,106,0.3)',
        gradient: 'linear-gradient(135deg, #180c0c 0%, #0d0707 100%)',
    },
    {
        name: 'Blue',
        color: '#6A9FD4',
        glow: 'rgba(106,159,212,0.3)',
        gradient: 'linear-gradient(135deg, #080f18 0%, #050810 100%)',
    },
    {
        name: 'Sage',
        color: '#8DBF7A',
        glow: 'rgba(141,191,122,0.3)',
        gradient: 'linear-gradient(135deg, #0b1408 0%, #07100a 100%)',
    },
] as const;

const DEFAULT_FORM = {
    name: '',
    tagline: '',
    systemPrompt: '',
    paletteIndex: 0,
    showThinking: false,
};

// ─── Modal ────────────────────────────────────────────────────────────────────

interface PersonaFormModalProps {
    /** Pass an existing persona to enter edit mode; null for create mode */
    persona?: Persona | null;
    onClose: () => void;
}

export default function PersonaFormModal({ persona, onClose }: PersonaFormModalProps) {
    const { addPersona, updatePersona } = useAppStore();

    const [form, setForm] = useState(() => {
        if (persona) {
            const pi = PALETTES.findIndex(p => p.color === persona.color);
            return {
                name: persona.name,
                tagline: persona.tagline,
                systemPrompt: persona.systemPrompt,
                paletteIndex: pi >= 0 ? pi : 0,
                showThinking: persona.showThinking,
            };
        }
        return { ...DEFAULT_FORM };
    });

    const [saving, setSaving] = useState(false);
    const palette = PALETTES[form.paletteIndex];

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            const data = {
                name: form.name.trim(),
                tagline: form.tagline.trim() || 'your companion',
                systemPrompt: form.systemPrompt.trim(),
                color: palette.color,
                glow: palette.glow,
                gradient: palette.gradient,
                online: true,
                showThinking: form.showThinking,
                avatarUrl: null,
                modelId: null,
            };
            if (persona) {
                await updatePersona({ ...persona, ...data });
            } else {
                await addPersona(data);
            }
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 100,
                    animation: 'slideUpFade 0.25s ease both',
                }}
            />

            {/* Sheet */}
            <div
                style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    maxHeight: '90dvh',
                    background: '#0f0d17',
                    borderTop: `1px solid ${palette.color}30`,
                    borderRadius: '20px 20px 0 0',
                    zIndex: 101,
                    overflowY: 'auto',
                    animation: 'sheetSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
                    paddingBottom: 'env(safe-area-inset-bottom, 16px)',
                }}
            >
                {/* Handle */}
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8 }}>
                    <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
                </div>

                <div style={{ padding: '8px 24px 24px' }}>
                    {/* Header */}
                    <div style={{ marginBottom: 28, textAlign: 'center' }}>
                        <h2
                            style={{
                                fontFamily: "'Instrument Serif', Georgia, serif",
                                fontSize: 22,
                                color: '#fff',
                                fontWeight: 400,
                                margin: 0,
                            }}
                        >
                            {persona ? 'Edit Persona' : 'New Persona'}
                        </h2>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace", marginTop: 6, marginBottom: 0 }}>
                            {persona ? 'customise your companion' : 'bring someone new to life'}
                        </p>
                    </div>

                    {/* Name */}
                    <Field label="Name">
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. Aria"
                            maxLength={32}
                            style={inputStyle()}
                            autoFocus
                        />
                    </Field>

                    {/* Tagline */}
                    <Field label="Tagline">
                        <input
                            type="text"
                            value={form.tagline}
                            onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
                            placeholder="e.g. your thoughtful companion"
                            maxLength={64}
                            style={inputStyle()}
                        />
                    </Field>

                    {/* Colour palette */}
                    <Field label="Soul Colour">
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {PALETTES.map((p, i) => (
                                <button
                                    key={i}
                                    onClick={() => setForm(f => ({ ...f, paletteIndex: i }))}
                                    title={p.name}
                                    style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: '50%',
                                        background: p.color,
                                        border: form.paletteIndex === i
                                            ? `2px solid #fff`
                                            : '2px solid transparent',
                                        cursor: 'pointer',
                                        outline: form.paletteIndex === i ? `2px solid ${p.color}` : 'none',
                                        outlineOffset: 2,
                                        boxShadow: form.paletteIndex === i ? `0 0 12px ${p.glow}` : 'none',
                                        transition: 'all 0.2s ease',
                                        flexShrink: 0,
                                    }}
                                />
                            ))}
                        </div>
                    </Field>

                    {/* System prompt */}
                    <Field label="Personality Prompt">
                        <textarea
                            value={form.systemPrompt}
                            onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                            placeholder="Describe how this persona thinks, feels, and speaks…"
                            rows={5}
                            style={{
                                ...inputStyle(),
                                resize: 'none',
                                lineHeight: 1.6,
                            }}
                        />
                    </Field>

                    {/* Show thinking toggle */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 0',
                            marginBottom: 24,
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>Show Thinking</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Display chain-of-thought blocks</div>
                        </div>
                        <Toggle
                            checked={form.showThinking}
                            color={palette.color}
                            onChange={v => setForm(f => ({ ...f, showThinking: v }))}
                        />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button
                            onClick={onClose}
                            style={{
                                flex: 1,
                                padding: '14px 0',
                                borderRadius: 12,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'transparent',
                                color: 'rgba(255,255,255,0.5)',
                                fontSize: 14,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!form.name.trim() || saving}
                            style={{
                                flex: 2,
                                padding: '14px 0',
                                borderRadius: 12,
                                border: 'none',
                                background: !form.name.trim() || saving ? 'rgba(255,255,255,0.1)' : palette.color,
                                color: !form.name.trim() || saving ? 'rgba(255,255,255,0.3)' : '#07050c',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: !form.name.trim() || saving ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease',
                                fontFamily: "'Courier New', monospace",
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase' as const,
                            }}
                        >
                            {saving ? '…' : persona ? 'Save Changes' : 'Create Persona'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <label
                style={{
                    display: 'block',
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.4)',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    fontFamily: "'Courier New', monospace",
                    marginBottom: 8,
                }}
            >
                {label}
            </label>
            {children}
        </div>
    );
}

function inputStyle(): React.CSSProperties {
    return {
        width: '100%',
        padding: '12px 14px',
        borderRadius: 10,
        border: `1px solid rgba(255,255,255,0.1)`,
        background: 'rgba(255,255,255,0.05)',
        color: '#fff',
        fontSize: 14,
        outline: 'none',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
        transition: 'border-color 0.2s ease',
        // Focus glow applied via :focus — not possible inline, handled in global CSS
    };
}

function Toggle({ checked, color, onChange }: { checked: boolean; color: string; onChange: (v: boolean) => void }) {
    return (
        <div
            onClick={() => onChange(!checked)}
            role="switch"
            aria-checked={checked}
            style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: checked ? color : 'rgba(255,255,255,0.1)',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.3s ease',
                flexShrink: 0,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: 3,
                    left: checked ? 23 : 3,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: checked ? `0 0 6px ${color}` : 'none',
                }}
            />
        </div>
    );
}
