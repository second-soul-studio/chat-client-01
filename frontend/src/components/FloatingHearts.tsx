import { useEffect, useState } from 'react';

interface FloatingHeartsProps {
    color: string;
    trigger: boolean;
    onComplete: () => void;
}

interface Heart {
    id: number;
    x: number;
    delay: number;
    size: number;
}

export default function FloatingHearts({ color, trigger, onComplete }: FloatingHeartsProps) {
    const [hearts, setHearts] = useState<Heart[]>([]);

    useEffect(() => {
        if (!trigger) return;

        const count = 3 + Math.floor(Math.random() * 3); // 3–5 hearts
        const newHearts: Heart[] = Array.from({ length: count }, (_, i) => ({
            id: i,
            x: 30 + Math.random() * 40, // 30–70% horizontal
            delay: i * 0.12,
            size: 14 + Math.random() * 10,
        }));
        setHearts(newHearts);

        const timer = setTimeout(() => {
            setHearts([]);
            onComplete();
        }, 1800);

        return () => clearTimeout(timer);
    }, [trigger, onComplete]);

    if (hearts.length === 0) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 1000,
                overflow: 'hidden',
            }}
        >
            {hearts.map(heart => (
                <span
                    key={heart.id}
                    style={{
                        position: 'absolute',
                        bottom: '20%',
                        left: `${heart.x}%`,
                        fontSize: heart.size,
                        color,
                        animation: `heartFloat 1.5s ease-out ${heart.delay}s forwards`,
                        opacity: 0,
                    }}
                >
                    ♥
                </span>
            ))}
        </div>
    );
}
