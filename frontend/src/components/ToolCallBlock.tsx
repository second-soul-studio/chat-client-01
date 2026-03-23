import { useEffect, useRef, useState } from 'react';
import type { ToolCallRecord } from '@/types';

export function ToolCallBlock({
    record,
    color,
}: {
    record: ToolCallRecord;
    color: string;
}) {
    const [open, setOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        if (contentRef.current) {
            setHeight(open ? contentRef.current.scrollHeight : 0);
        }
    }, [open, record]);

    const isPending = record.status === 'pending';
    const isError = record.status === 'error';

    const label = isPending
        ? `Searching for "${record.query}"…`
        : isError
        ? `Web search failed: "${record.query}"`
        : `Web search: "${record.query}"`;

    return (
        <div style={{ marginBottom: 8 }}>
            <div
                onClick={() => !isPending && setOpen(o => !o)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    cursor: isPending ? 'default' : 'pointer',
                    userSelect: 'none',
                    padding: '5px 12px 5px 8px',
                    borderRadius: 20,
                    border: `1px solid ${open ? color + '44' : 'rgba(255,255,255,0.08)'}`,
                    background: open ? `${color}0e` : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.2s ease',
                }}
            >
                {/* Icon */}
                <span style={{ fontSize: 12, opacity: isError ? 1 : 0.7 }}>
                    {isError ? '⚠' : '🔍'}
                </span>

                <span style={{
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    fontFamily: "'Courier New', monospace",
                    color: isError ? '#ff6b6b' : open ? color : 'rgba(255,255,255,0.35)',
                    transition: 'color 0.2s',
                    maxWidth: 280,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {label}
                </span>

                {!isPending && !isError && (
                    <span style={{
                        fontSize: 8,
                        color: open ? color : 'rgba(255,255,255,0.2)',
                        transition: 'transform 0.25s ease, color 0.2s',
                        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                        display: 'inline-block',
                        marginLeft: 2,
                    }}>
                        ▼
                    </span>
                )}

                {isPending && (
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{
                                width: 4, height: 4, borderRadius: '50%', background: color,
                                animation: 'typingBounce 1.2s ease-in-out infinite',
                                animationDelay: `${i * 0.2}s`, opacity: 0.7,
                            }} />
                        ))}
                    </div>
                )}
            </div>

            {/* Collapsible results */}
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
                    }}
                >
                    {record.results && record.results.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {record.results.map((r, i) => (
                                <div key={i}>
                                    <a
                                        href={r.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            fontSize: 12,
                                            color,
                                            textDecoration: 'none',
                                            fontFamily: "'Lora', Georgia, serif",
                                        }}
                                    >
                                        {r.title}
                                    </a>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: "'Courier New', monospace", marginTop: 1, marginBottom: 3 }}>
                                        {r.url}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: "'Lora', Georgia, serif", lineHeight: 1.6 }}>
                                        {r.snippet}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                            No results found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
