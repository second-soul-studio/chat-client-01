import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
    language: string;
    code: string;
    accentColor: string;
}

export function CodeBlock({ language, code, accentColor }: CodeBlockProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div style={{
            borderRadius: 8,
            overflow: 'hidden',
            border: `1px solid ${accentColor}22`,
            marginBottom: 4,
        }}>
            {/* Header */}
            <div style={{
                background: `${accentColor}0e`,
                borderBottom: `1px solid ${accentColor}22`,
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <span style={{
                    fontSize: 9,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    fontFamily: "'Courier New', monospace",
                    color: accentColor,
                    opacity: 0.8,
                }}>
                    {language || 'code'}
                </span>
                <button
                    onClick={handleCopy}
                    style={{
                        background: copied ? `${accentColor}22` : 'transparent',
                        border: `1px solid ${copied ? accentColor : `${accentColor}33`}`,
                        borderRadius: 6,
                        padding: '3px 8px',
                        fontSize: 9,
                        color: copied ? accentColor : `${accentColor}99`,
                        cursor: 'pointer',
                        letterSpacing: '0.08em',
                        transition: 'all 0.2s ease',
                        fontFamily: "'Courier New', monospace",
                    }}
                >
                    {copied ? 'copied ✓' : 'copy'}
                </button>
            </div>
            {/* Code */}
            <SyntaxHighlighter
                language={language || 'text'}
                style={oneDark}
                customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    fontSize: 12.5,
                    background: '#0d0a14',
                    padding: '14px 16px',
                }}
            >
                {code}
            </SyntaxHighlighter>
        </div>
    );
}
