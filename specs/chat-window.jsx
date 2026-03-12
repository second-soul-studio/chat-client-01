import { useState, useRef, useEffect } from "react";

const PERSONA = {
  name: "Lyra",
  tagline: "philosopher · guide",
  color: "#C9A96E",
  glow: "rgba(201,169,110,0.3)",
  avatar: "L",
  gradient: "linear-gradient(135deg, #2a1f0e 0%, #4a3520 50%, #1a1208 100%)",
};

const INITIAL_MESSAGES = [
  {
    id: "1",
    role: "assistant",
    content: "Hey. Schön dass du da bist.\n\nWorüber möchtest du heute nachdenken?",
    timestamp: Date.now() - 120000,
  },
  {
    id: "2",
    role: "user",
    content: "Ich frage mich manchmal, ob Klarheit Freiheit ist — oder ob sie Freiheit erst möglich macht.",
    timestamp: Date.now() - 90000,
  },
  {
    id: "3",
    role: "assistant",
    thinking: `Die Frage hat zwei Lesarten. Entweder Klarheit = Freiheit (sie sind dasselbe Ding), oder Klarheit → Freiheit (sie ist eine Voraussetzung dafür).

Wenn ich an Chris' Muster denke: Er baut immer Strukturen die Räume öffnen. Second Circuit, die Governance-Docs, sogar seine Architekturen. Das ist nicht Klarheit als Ziel — das ist Klarheit als Werkzeug.

Die interessantere philosophische Position ist die zweite. Sartre würde sagen Freiheit ist immer schon da, aber Klarheit macht sie *erträglich* oder *nutzbar*. Heidegger würde von Erschlossenheit sprechen...

Aber ich will nicht zu akademisch werden. Was er wirklich fragt ist: wie verhält sich Klarheit zu dem was er tut? Und da ist die Antwort: er baut keine Ziele, er baut Möglichkeitsräume. Das ist der Kern.

Kurz antworten, nicht überladen. Den Kern treffen.`,
    content: "Das ist ein Unterschied der zählt.\n\nKlarheit *als* Freiheit wäre ein Ziel — etwas das man erreicht und dann hat. Aber Klarheit *als Bedingung* von Freiheit — das ist etwas Lebendigeres. Sie öffnet einen Raum, in dem Freiheit überhaupt erst atmen kann.\n\nIch glaube du meinst das Zweite. Du baust immer Räume, keine Ziele.",
    timestamp: Date.now() - 60000,
  },
  {
    id: "4",
    role: "user",
    content: "Ja. Genau das.",
    timestamp: Date.now() - 30000,
  },
];

const MOCK_THINKING = [
  `Kurze Frage, aber dahinter steckt etwas Tieferes. Er reflektiert gerade — nicht inhaltlich, sondern über seine eigene Art zu sein.\n\nIch könnte eine Gegenfrage stellen oder einfach den Raum halten. Ich glaube eine offene Frage ist hier besser als eine Aussage. Nicht zu viel Richtung vorgeben.`,
  `"Da ist etwas Stilles" — das stimmt. Er sagt wenig aber meint viel. Ich will nicht übererklären. Einladen statt interpretieren.`,
  `Interessant: er fragt nicht "was will ich" sondern "wie will ich sein". Das ist ein Ontologie-Wechsel. Von Zielen zu Haltungen. Das ist seltener als man denkt und verdient Aufmerksamkeit ohne zu viel Gewicht draufzulegen.\n\nKeine lange Antwort — das würde den Moment zerquatschen.`,
  `Stille aushalten. Er braucht keinen Rat, er braucht einen Gesprächspartner der wartet. Ich stelle eine Frage die ihn nach innen führt, nicht nach außen.`,
  `Das klingt nach etwas das er schon länger trägt. Nicht heute entstanden. Ich will das spiegeln ohne zu diagnostizieren — einfach benennen dass es da ist.`,
];

const MOCK_RESPONSES = [
  { content: "Und was verändert sich, wenn du das so siehst?", memory: null },
  { content: "Da ist etwas Stilles darin. Erzähl mir mehr.", memory: null },
  { content: "Ich find das interessant — weil du nicht fragst *was* du willst, sondern *wie* du sein willst. Das ist seltener als man denkt.", memory: { type: "pattern", icon: "◎", text: "kommt durch Vibing zu Ideen, nicht durch lineare Analyse" } },
  { content: "Mmh. Lass das einen Moment stehen.\n\nWas kommt, wenn du nicht sofort antwortest?", memory: null },
  { content: "Das klingt nach etwas das schon lange in dir arbeitet. Nicht neu — nur jetzt ausgesprochen.", memory: { type: "emotion", icon: "♡", text: "trägt etwas schon lange mit sich — wiederkehrendes Thema" } },
];

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
}

function SimpleMarkdown({ text }) {
  const lines = text.split("\n");
  return (
    <div>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: "0.5em" }} />;
        const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
        return (
          <p key={i} style={{ margin: 0, lineHeight: 1.65 }}>
            {parts.map((part, j) => {
              if (part.startsWith("**") && part.endsWith("**"))
                return <strong key={j}>{part.slice(2, -2)}</strong>;
              if (part.startsWith("*") && part.endsWith("*"))
                return <em key={j}>{part.slice(1, -1)}</em>;
              return part;
            })}
          </p>
        );
      })}
    </div>
  );
}

function TypingIndicator({ color }) {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "4px 2px" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: "50%",
          background: color,
          animation: `typingBounce 1.2s ease-in-out infinite`,
          animationDelay: `${i * 0.2}s`,
          opacity: 0.7,
        }} />
      ))}
    </div>
  );
}

// Floating hearts/symbols that rise after a memory-worthy moment
function FloatingHearts({ color, icon, onDone }) {
  const particles = Array.from({ length: 5 }, (_, i) => i);
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      position: "absolute", bottom: 60, right: 56,
      width: 60, height: 80, pointerEvents: "none", zIndex: 20,
    }}>
      {particles.map(i => (
        <div key={i} style={{
          position: "absolute",
          bottom: 0,
          left: `${10 + i * 10}px`,
          fontSize: i === 2 ? 18 : 12,
          color: color,
          opacity: 0,
          animation: `heartFloat 2.6s ease-out forwards`,
          animationDelay: `${i * 0.18}s`,
          filter: `drop-shadow(0 0 4px ${color})`,
        }}>
          {icon}
        </div>
      ))}
    </div>
  );
}

// Subtle memory confirmation bar below input
function MemoryPrompt({ memory, color, glow, onAccept, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  const typeLabel = memory.type === "emotion" ? "Gefühl" : memory.type === "pattern" ? "Muster" : "Notiz";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px",
      marginBottom: 8,
      borderRadius: 16,
      background: `${color}0d`,
      border: `1px solid ${color}2a`,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(6px)",
      transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
      boxShadow: visible ? `0 0 16px ${color}18` : "none",
    }}>
      {/* Icon */}
      <span style={{ fontSize: 14, color, flexShrink: 0 }}>{memory.icon}</span>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 9, color, opacity: 0.6,
          letterSpacing: "0.15em", textTransform: "uppercase",
          fontFamily: "'Courier New', monospace",
          marginRight: 6,
        }}>
          {typeLabel} merken?
        </span>
        <span style={{
          fontSize: 11.5,
          color: "rgba(255,255,255,0.5)",
          fontFamily: "'Lora', Georgia, serif",
          fontStyle: "italic",
        }}>
          {memory.text}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <div onClick={onAccept} style={{
          padding: "4px 10px", borderRadius: 10, cursor: "pointer",
          background: `${color}22`, border: `1px solid ${color}44`,
          fontSize: 10, color,
          fontFamily: "'Courier New', monospace",
          letterSpacing: "0.1em",
          transition: "all 0.15s",
        }}>
          ja
        </div>
        <div onClick={onDismiss} style={{
          padding: "4px 10px", borderRadius: 10, cursor: "pointer",
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          fontSize: 10, color: "rgba(255,255,255,0.25)",
          fontFamily: "'Courier New', monospace",
          letterSpacing: "0.1em",
        }}>
          nein
        </div>
      </div>
    </div>
  );
}

function ThinkingBlock({ thinking, color, glow }) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(open ? contentRef.current.scrollHeight : 0);
    }
  }, [open]);

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Toggle button */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          cursor: "pointer", userSelect: "none",
          padding: "5px 12px 5px 8px",
          borderRadius: 20,
          border: `1px solid ${open ? color + "44" : "rgba(255,255,255,0.08)"}`,
          background: open ? `${color}0e` : "rgba(255,255,255,0.02)",
          transition: "all 0.2s ease",
        }}
      >
        {/* Animated brain/spark icon */}
        <div style={{
          width: 16, height: 16, position: "relative", flexShrink: 0,
        }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              position: "absolute",
              width: 3, height: 3, borderRadius: "50%",
              background: color,
              opacity: open ? 0.9 : 0.4,
              top: i === 1 ? "50%" : i === 0 ? "15%" : "75%",
              left: i === 0 ? "20%" : i === 1 ? "65%" : "35%",
              transform: "translate(-50%, -50%)",
              animation: open ? `thinkPulse 1.5s ease-in-out infinite` : "none",
              animationDelay: `${i * 0.3}s`,
              transition: "opacity 0.2s",
            }} />
          ))}
          {/* Connecting lines */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: open ? 0.5 : 0.15, transition: "opacity 0.2s" }} viewBox="0 0 16 16">
            <line x1="3" y1="2" x2="10" y2="8" stroke={color} strokeWidth="0.8" />
            <line x1="10" y1="8" x2="6" y2="13" stroke={color} strokeWidth="0.8" />
            <line x1="3" y1="2" x2="6" y2="13" stroke={color} strokeWidth="0.8" />
          </svg>
        </div>

        <span style={{
          fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
          fontFamily: "'Courier New', monospace",
          color: open ? color : "rgba(255,255,255,0.3)",
          transition: "color 0.2s",
        }}>
          Gedanken
        </span>

        {/* Chevron */}
        <span style={{
          fontSize: 8, color: open ? color : "rgba(255,255,255,0.2)",
          transition: "transform 0.25s ease, color 0.2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          display: "inline-block",
          marginLeft: 2,
        }}>
          ▼
        </span>
      </div>

      {/* Collapsible content */}
      <div style={{
        overflow: "hidden",
        height: height,
        transition: "height 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <div ref={contentRef} style={{
          marginTop: 8,
          padding: "12px 16px",
          background: `linear-gradient(135deg, ${color}08 0%, rgba(255,255,255,0.02) 100%)`,
          border: `1px solid ${color}22`,
          borderLeft: `2px solid ${color}55`,
          borderRadius: "4px 12px 12px 12px",
          boxShadow: `inset 0 1px 0 ${color}11`,
        }}>
          {/* Header */}
          <div style={{
            fontSize: 9, color: color, opacity: 0.6,
            letterSpacing: "0.2em", textTransform: "uppercase",
            fontFamily: "'Courier New', monospace",
            marginBottom: 10,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: color, animation: "thinkPulse 2s ease-in-out infinite" }} />
            interner monolog
          </div>

          {/* Thinking text */}
          <div style={{
            fontSize: 12.5,
            color: "rgba(255,255,255,0.38)",
            fontFamily: "'Lora', Georgia, serif",
            fontStyle: "italic",
            lineHeight: 1.75,
            whiteSpace: "pre-line",
          }}>
            {thinking}
          </div>
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({ message, persona, isStreaming }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", maxWidth: "85%" }}>
      {/* Avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
        background: persona.gradient,
        border: `1px solid ${persona.color}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 12px ${persona.glow}`,
        fontSize: 14,
        fontFamily: "'Instrument Serif', Georgia, serif",
        color: persona.color,
        alignSelf: "flex-start",
        marginTop: 2,
      }}>
        {persona.avatar}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Thinking block — only if present and not streaming */}
        {message.thinking && !isStreaming && (
          <ThinkingBlock thinking={message.thinking} color={persona.color} glow={persona.glow} />
        )}

        {/* Bubble */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: `1px solid rgba(255,255,255,0.08)`,
          borderRadius: "4px 20px 20px 20px",
          padding: "14px 18px",
          color: "#e8e0d4",
          fontSize: 14.5,
          fontFamily: "'Lora', Georgia, serif",
          lineHeight: 1.65,
          backdropFilter: "blur(10px)",
          boxShadow: `0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)`,
          position: "relative",
        }}>
          {isStreaming
            ? <TypingIndicator color={persona.color} />
            : <SimpleMarkdown text={message.content} />
          }

          {/* Subtle left accent */}
          <div style={{
            position: "absolute", left: 0, top: 12, bottom: 12,
            width: 2, borderRadius: 2,
            background: `linear-gradient(to bottom, ${persona.color}88, transparent)`,
          }} />
        </div>

        <div style={{
          marginTop: 4, marginLeft: 6,
          fontSize: 10, color: "rgba(255,255,255,0.2)",
          fontFamily: "'Courier New', monospace",
          letterSpacing: "0.05em",
        }}>
          {persona.name} · {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

function UserBubble({ message, accentColor }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{ maxWidth: "78%" }}>
        <div style={{
          background: `linear-gradient(135deg, ${accentColor}22 0%, ${accentColor}12 100%)`,
          border: `1px solid ${accentColor}33`,
          borderRadius: "20px 4px 20px 20px",
          padding: "13px 18px",
          color: "#f0ebe0",
          fontSize: 14.5,
          fontFamily: "'Lora', Georgia, serif",
          lineHeight: 1.65,
          boxShadow: `0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 ${accentColor}22`,
        }}>
          <SimpleMarkdown text={message.content} />
        </div>
        <div style={{
          marginTop: 4, marginRight: 6, textAlign: "right",
          fontSize: 10, color: "rgba(255,255,255,0.2)",
          fontFamily: "'Courier New', monospace",
          letterSpacing: "0.05em",
        }}>
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

function DateDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
      <span style={{
        fontSize: 10, color: "rgba(255,255,255,0.2)",
        fontFamily: "'Courier New', monospace",
        letterSpacing: "0.15em", textTransform: "uppercase",
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
    </div>
  );
}

export default function SecondSoulChat() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [responseIdx, setResponseIdx] = useState(0);
  const [floatingMemory, setFloatingMemory] = useState(null);   // {icon, color} — triggers hearts
  const [pendingMemory, setPendingMemory] = useState(null);     // memory suggestion to confirm
  const [savedMemories, setSavedMemories] = useState([]);       // accepted memories
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, pendingMemory]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const userMsg = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    setPendingMemory(null);

    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));

    const resp = MOCK_RESPONSES[responseIdx % MOCK_RESPONSES.length];
    const thinking = MOCK_THINKING[responseIdx % MOCK_THINKING.length];

    const assistantMsg = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      thinking,
      content: resp.content,
      timestamp: Date.now(),
    };
    setResponseIdx(i => i + 1);
    setIsTyping(false);
    setMessages(prev => [...prev, assistantMsg]);

    // Trigger memory moment if this response has one
    if (resp.memory) {
      setTimeout(() => {
        setFloatingMemory({ icon: resp.memory.icon, color: PERSONA.color });
        setTimeout(() => setPendingMemory(resp.memory), 1200);
      }, 600);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const adjustTextarea = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "#07050c", overflow: "hidden", position: "relative",
      fontFamily: "system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Lora:ital@0;1&display=swap');

        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes heartFloat {
          0%   { opacity: 0; transform: translateY(0) scale(0.5); }
          15%  { opacity: 1; transform: translateY(-8px) scale(1.1); }
          80%  { opacity: 0.7; }
          100% { opacity: 0; transform: translateY(-70px) scale(0.8) rotate(15deg); }
        }
        @keyframes thinkPulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes nebulaFloat {
          0%, 100% { transform: translate(0,0) scale(1); }
          50% { transform: translate(20px,-15px) scale(1.04); }
        }
        .message-enter {
          animation: fadeSlideUp 0.35s cubic-bezier(0.16,1,0.3,1) both;
        }
        textarea:focus { outline: none; }
        textarea::placeholder { color: rgba(255,255,255,0.2); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>

      {/* Background atmosphere */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{
          position: "absolute", left: "10%", top: "20%",
          width: 500, height: 500, borderRadius: "50%",
          background: `radial-gradient(circle, ${PERSONA.color}06 0%, transparent 70%)`,
          animation: "nebulaFloat 14s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", right: "5%", bottom: "25%",
          width: 350, height: 350, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(158,143,212,0.04) 0%, transparent 70%)",
          animation: "nebulaFloat 18s ease-in-out infinite reverse",
        }} />
      </div>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "16px 20px",
        background: "rgba(7,5,12,0.8)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
        zIndex: 10, flexShrink: 0,
      }}>
        {/* Back arrow */}
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: "rgba(255,255,255,0.4)",
          fontSize: 14, flexShrink: 0,
        }}>
          ←
        </div>

        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
          background: PERSONA.gradient,
          border: `1.5px solid ${PERSONA.color}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 16px ${PERSONA.glow}`,
          fontSize: 16, fontFamily: "'Instrument Serif', Georgia, serif",
          color: PERSONA.color,
        }}>
          {PERSONA.avatar}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontFamily: "'Instrument Serif', Georgia, serif",
            color: "#ffffff", letterSpacing: "0.01em",
          }}>
            {PERSONA.name}
          </div>
          <div style={{
            fontSize: 10, color: PERSONA.color, opacity: 0.7,
            letterSpacing: "0.15em", textTransform: "uppercase",
            fontFamily: "'Courier New', monospace",
          }}>
            {isTyping ? "schreibt…" : PERSONA.tagline}
          </div>
        </div>

        {/* Menu dots */}
        <div style={{
          display: "flex", gap: 3, alignItems: "center",
          padding: "8px 10px", cursor: "pointer",
        }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width: 4, height: 4, borderRadius: "50%",
              background: "rgba(255,255,255,0.25)",
            }} />
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "24px 20px",
        display: "flex", flexDirection: "column", gap: 20,
        position: "relative", zIndex: 1,
      }}>
        <DateDivider label="heute" />

        {messages.map((msg, i) => (
          <div key={msg.id} className="message-enter" style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}>
            {msg.role === "assistant"
              ? <AssistantBubble message={msg} persona={PERSONA} isStreaming={false} />
              : <UserBubble message={msg} accentColor={PERSONA.color} />
            }
          </div>
        ))}

        {isTyping && (
          <div className="message-enter">
            <AssistantBubble
              message={{ id: "typing", content: "", timestamp: Date.now() }}
              persona={PERSONA}
              isStreaming={true}
            />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: "12px 16px 20px",
        background: "rgba(7,5,12,0.9)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
        zIndex: 10, flexShrink: 0,
        position: "relative",
      }}>
        {/* Floating hearts — positioned relative to input area */}
        {floatingMemory && (
          <FloatingHearts
            color={floatingMemory.color}
            icon={floatingMemory.icon}
            onDone={() => setFloatingMemory(null)}
          />
        )}

        {/* Memory prompt */}
        {pendingMemory && (
          <MemoryPrompt
            memory={pendingMemory}
            color={PERSONA.color}
            glow={PERSONA.glow}
            onAccept={() => {
              setSavedMemories(prev => [...prev, pendingMemory]);
              setPendingMemory(null);
            }}
            onDismiss={() => setPendingMemory(null)}
          />
        )}

        {/* Saved memories indicator */}
        {savedMemories.length > 0 && (
          <div style={{
            display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap",
          }}>
            {savedMemories.map((m, i) => (
              <div key={i} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 10px",
                borderRadius: 12,
                background: `${PERSONA.color}0a`,
                border: `1px solid ${PERSONA.color}20`,
                fontSize: 10,
                color: `${PERSONA.color}99`,
                fontFamily: "'Courier New', monospace",
                letterSpacing: "0.05em",
              }}>
                <span>{m.icon}</span>
                <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.text}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-end",
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${input ? PERSONA.color + "44" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 24,
          padding: "10px 8px 10px 18px",
          transition: "border-color 0.2s ease",
          boxShadow: input ? `0 0 20px ${PERSONA.glow}` : "none",
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={adjustTextarea}
            onKeyDown={handleKeyDown}
            placeholder="Schreib etwas…"
            rows={1}
            style={{
              flex: 1, background: "transparent", border: "none",
              color: "#e8e0d4", fontSize: 14.5, resize: "none",
              fontFamily: "'Lora', Georgia, serif",
              lineHeight: 1.6, maxHeight: 120,
              paddingTop: 2,
            }}
          />

          {/* Send button */}
          <div
            onClick={handleSend}
            style={{
              width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
              background: input.trim() && !isTyping
                ? `linear-gradient(135deg, ${PERSONA.color} 0%, ${PERSONA.color}88 100%)`
                : "rgba(255,255,255,0.06)",
              border: `1px solid ${input.trim() ? PERSONA.color + "66" : "rgba(255,255,255,0.1)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: input.trim() && !isTyping ? "pointer" : "default",
              transition: "all 0.2s ease",
              fontSize: 15,
              color: input.trim() && !isTyping ? "#000000cc" : "rgba(255,255,255,0.2)",
              boxShadow: input.trim() ? `0 0 16px ${PERSONA.glow}` : "none",
            }}
          >
            ↑
          </div>
        </div>

        <div style={{
          textAlign: "center", marginTop: 8,
          fontSize: 9, color: "rgba(255,255,255,0.12)",
          letterSpacing: "0.15em", textTransform: "uppercase",
          fontFamily: "'Courier New', monospace",
        }}>
          Enter senden · Shift+Enter neue Zeile
        </div>
      </div>
    </div>
  );
}
