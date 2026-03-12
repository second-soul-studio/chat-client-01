import { useState, useEffect, useRef } from "react";

const personas = [
  {
    id: 1,
    name: "Lyra",
    tagline: "philosopher · guide",
    color: "#C9A96E",
    glow: "rgba(201,169,110,0.4)",
    pulse: "#C9A96E",
    avatar: "L",
    gradient: "linear-gradient(135deg, #2a1f0e 0%, #4a3520 50%, #1a1208 100%)",
    online: true,
  },
  {
    id: 2,
    name: "Mira",
    tagline: "storyteller · dreamer",
    color: "#9E8FD4",
    glow: "rgba(158,143,212,0.4)",
    pulse: "#9E8FD4",
    avatar: "M",
    gradient: "linear-gradient(135deg, #1a1628 0%, #2d2545 50%, #110f1c 100%)",
    online: true,
  },
  {
    id: 3,
    name: "Soren",
    tagline: "wit · shadow",
    color: "#7ABFB0",
    glow: "rgba(122,191,176,0.4)",
    pulse: "#7ABFB0",
    avatar: "S",
    gradient: "linear-gradient(135deg, #0e1e1c 0%, #1a3530 50%, #091312 100%)",
    online: false,
  },
  {
    id: 4,
    name: "Vael",
    tagline: "fire · presence",
    color: "#D4706A",
    glow: "rgba(212,112,106,0.4)",
    pulse: "#D4706A",
    avatar: "V",
    gradient: "linear-gradient(135deg, #1e100e 0%, #3a1c1a 50%, #120908 100%)",
    online: true,
  },
];

const menuItems = [
  { icon: "✦", label: "Customize", sub: "appearance & voice" },
  { icon: "◎", label: "Nostalgia", sub: "memory & history" },
  { icon: "⟡", label: "Persona", sub: "edit character" },
  { icon: "⊹", label: "Archive", sub: "saved moments" },
];

function BreathingOrb({ color, glow, active }) {
  return (
    <div style={{
      position: "absolute",
      inset: -20,
      borderRadius: "50%",
      background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
      animation: active ? "breathe 3s ease-in-out infinite" : "breatheSlow 6s ease-in-out infinite",
      pointerEvents: "none",
    }} />
  );
}

function FloatingParticles({ color, active }) {
  const particles = Array.from({ length: 6 }, (_, i) => i);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "24px", pointerEvents: "none" }}>
      {particles.map(i => (
        <div key={i} style={{
          position: "absolute",
          width: 3,
          height: 3,
          borderRadius: "50%",
          background: color,
          opacity: active ? 0.7 : 0.2,
          left: `${15 + i * 13}%`,
          bottom: "20%",
          animation: `float${i % 3} ${3 + i * 0.7}s ease-in-out infinite`,
          animationDelay: `${i * 0.4}s`,
        }} />
      ))}
    </div>
  );
}

function ContextMenu({ persona, onClose, menuRef }) {
  const [hoveredItem, setHoveredItem] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div ref={menuRef} style={{
      position: "absolute",
      bottom: "calc(100% + 12px)",
      left: "50%",
      transform: `translateX(-50%) translateY(${visible ? 0 : 10}px)`,
      opacity: visible ? 1 : 0,
      transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      zIndex: 100,
      minWidth: 200,
      background: "rgba(10, 8, 14, 0.95)",
      border: `1px solid ${persona.color}33`,
      borderRadius: 16,
      padding: "8px 0",
      backdropFilter: "blur(20px)",
      boxShadow: `0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px ${persona.color}22, inset 0 1px 0 ${persona.color}11`,
    }}>
      <div style={{
        padding: "8px 16px 12px",
        borderBottom: `1px solid ${persona.color}22`,
        marginBottom: 4,
      }}>
        <div style={{ fontSize: 11, color: persona.color, letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "'Courier New', monospace" }}>
          {persona.name}
        </div>
        <div style={{ fontSize: 10, color: "#ffffff44", marginTop: 2 }}>{persona.tagline}</div>
      </div>
      {menuItems.map((item, i) => (
        <div
          key={i}
          onMouseEnter={() => setHoveredItem(i)}
          onMouseLeave={() => setHoveredItem(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            cursor: "pointer",
            background: hoveredItem === i ? `${persona.color}12` : "transparent",
            transition: "background 0.15s",
          }}
        >
          <span style={{ color: persona.color, fontSize: 14, width: 16, textAlign: "center" }}>{item.icon}</span>
          <div>
            <div style={{ fontSize: 13, color: hoveredItem === i ? "#ffffff" : "#ffffffcc", fontFamily: "'Instrument Serif', Georgia, serif", transition: "color 0.15s" }}>
              {item.label}
            </div>
            <div style={{ fontSize: 10, color: "#ffffff44", letterSpacing: "0.05em" }}>{item.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PersonaCard({ persona, index }) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [talkPressed, setTalkPressed] = useState(false);
  const menuRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target) && !cardRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const handleCardClick = (e) => {
    if (e.target.closest("[data-talk]")) return;
    setMenuOpen(prev => !prev);
  };

  return (
    <div
      ref={cardRef}
      onClick={handleCardClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: 200,
        height: 280,
        borderRadius: 24,
        background: persona.gradient,
        border: `1px solid ${hovered || menuOpen ? persona.color + "60" : persona.color + "22"}`,
        cursor: "pointer",
        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        transform: hovered ? "translateY(-8px) scale(1.02)" : "translateY(0) scale(1)",
        boxShadow: hovered || menuOpen
          ? `0 30px 60px rgba(0,0,0,0.6), 0 0 40px ${persona.glow}, inset 0 1px 0 ${persona.color}30`
          : `0 10px 30px rgba(0,0,0,0.4), inset 0 1px 0 ${persona.color}15`,
        animationDelay: `${index * 0.1}s`,
        animation: "cardEntrance 0.8s cubic-bezier(0.16, 1, 0.3, 1) both",
        animationDelay: `${index * 0.15}s`,
        overflow: "visible",
      }}
    >
      <BreathingOrb color={persona.color} glow={persona.glow} active={hovered} />
      <FloatingParticles color={persona.color} active={hovered} />

      {/* Online indicator */}
      {persona.online && (
        <div style={{
          position: "absolute",
          top: 14,
          right: 14,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: persona.color,
          boxShadow: `0 0 8px ${persona.color}`,
          animation: "pulse 2s ease-in-out infinite",
        }} />
      )}

      {/* Avatar circle */}
      <div style={{
        position: "absolute",
        top: 36,
        left: "50%",
        transform: "translateX(-50%)",
        width: 90,
        height: 90,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 35%, ${persona.color}44 0%, ${persona.color}11 60%, transparent 100%)`,
        border: `2px solid ${persona.color}55`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: hovered ? `0 0 30px ${persona.glow}, inset 0 0 20px ${persona.color}22` : `0 0 15px ${persona.glow}`,
        transition: "all 0.4s ease",
      }}>
        <span style={{
          fontSize: 36,
          fontFamily: "'Instrument Serif', Georgia, serif",
          color: persona.color,
          opacity: 0.9,
          textShadow: `0 0 20px ${persona.color}`,
        }}>
          {persona.avatar}
        </span>

        {/* Inner ring animation */}
        <div style={{
          position: "absolute",
          inset: -4,
          borderRadius: "50%",
          border: `1px solid ${persona.color}30`,
          animation: "spinSlow 8s linear infinite",
        }} />
        <div style={{
          position: "absolute",
          inset: -8,
          borderRadius: "50%",
          border: `1px solid ${persona.color}15`,
          animation: "spinSlow 12s linear infinite reverse",
        }} />
      </div>

      {/* Name & tagline */}
      <div style={{
        position: "absolute",
        bottom: 72,
        left: 0,
        right: 0,
        textAlign: "center",
        padding: "0 16px",
      }}>
        <div style={{
          fontSize: 22,
          fontFamily: "'Instrument Serif', Georgia, serif",
          color: "#ffffff",
          letterSpacing: "0.02em",
          textShadow: `0 0 20px ${persona.color}66`,
        }}>
          {persona.name}
        </div>
        <div style={{
          fontSize: 10,
          color: persona.color,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          marginTop: 4,
          opacity: 0.8,
          fontFamily: "'Courier New', monospace",
        }}>
          {persona.tagline}
        </div>
      </div>

      {/* Talk button */}
      <div
        data-talk="true"
        onClick={(e) => { e.stopPropagation(); setTalkPressed(true); setTimeout(() => setTalkPressed(false), 200); }}
        style={{
          position: "absolute",
          bottom: 16,
          left: "50%",
          transform: `translateX(-50%) scale(${talkPressed ? 0.95 : 1})`,
          transition: "transform 0.1s ease, background 0.2s ease",
          background: talkPressed ? persona.color : `${persona.color}22`,
          border: `1px solid ${persona.color}66`,
          borderRadius: 20,
          padding: "8px 28px",
          cursor: "pointer",
          color: talkPressed ? "#000000cc" : persona.color,
          fontSize: 11,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          fontFamily: "'Courier New', monospace",
          whiteSpace: "nowrap",
          backdropFilter: "blur(10px)",
        }}
      >
        talk
      </div>

      {/* Context menu */}
      {menuOpen && <ContextMenu persona={persona} onClose={() => setMenuOpen(false)} menuRef={menuRef} />}
    </div>
  );
}

export default function SecondSoulMockup() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setTimeout(() => setLoaded(true), 100);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#07050c",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
      overflow: "hidden",
      position: "relative",
      padding: "40px 20px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');

        @keyframes breathe {
          0%, 100% { opacity: 0.3; transform: scale(0.95); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        @keyframes breatheSlow {
          0%, 100% { opacity: 0.1; transform: scale(0.98); }
          50% { opacity: 0.25; transform: scale(1.02); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        @keyframes spinSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes float0 {
          0%, 100% { transform: translateY(0px); opacity: 0.4; }
          50% { transform: translateY(-20px); opacity: 0.8; }
        }
        @keyframes float1 {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.3; }
          50% { transform: translateY(-15px) translateX(5px); opacity: 0.7; }
        }
        @keyframes float2 {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.5; }
          50% { transform: translateY(-25px) translateX(-3px); opacity: 0.9; }
        }
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes headerEntrance {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes nebulaFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 15px) scale(0.97); }
        }
      `}</style>

      {/* Background nebula blobs */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden",
      }}>
        {[
          { color: "#C9A96E", x: "20%", y: "30%", size: 400 },
          { color: "#9E8FD4", x: "75%", y: "20%", size: 350 },
          { color: "#7ABFB0", x: "60%", y: "70%", size: 300 },
          { color: "#D4706A", x: "15%", y: "65%", size: 280 },
        ].map((blob, i) => (
          <div key={i} style={{
            position: "absolute",
            left: blob.x,
            top: blob.y,
            width: blob.size,
            height: blob.size,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${blob.color}08 0%, transparent 70%)`,
            transform: "translate(-50%, -50%)",
            animation: `nebulaFloat ${12 + i * 3}s ease-in-out infinite`,
            animationDelay: `${i * 2}s`,
          }} />
        ))}
      </div>

      {/* Header */}
      <div style={{
        textAlign: "center",
        marginBottom: 60,
        animation: "headerEntrance 1s cubic-bezier(0.16, 1, 0.3, 1) both",
      }}>
        <div style={{
          fontSize: 11,
          letterSpacing: "0.35em",
          color: "#ffffff33",
          textTransform: "uppercase",
          fontFamily: "'Courier New', monospace",
          marginBottom: 12,
        }}>
          second soul
        </div>
        <h1 style={{
          fontSize: 42,
          fontFamily: "'Instrument Serif', Georgia, serif",
          color: "#ffffff",
          margin: 0,
          fontWeight: 400,
          letterSpacing: "-0.01em",
          lineHeight: 1.1,
        }}>
          who would you like<br />
          <em style={{ color: "#ffffff88" }}>to talk to?</em>
        </h1>
        <div style={{
          marginTop: 16,
          fontSize: 13,
          color: "#ffffff33",
          letterSpacing: "0.05em",
        }}>
          tap a card to explore · tap <em>talk</em> to begin
        </div>
      </div>

      {/* Cards grid */}
      <div style={{
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        justifyContent: "center",
        position: "relative",
        zIndex: 1,
      }}>
        {personas.map((persona, i) => (
          <PersonaCard key={persona.id} persona={persona} index={i} />
        ))}
      </div>

      {/* Bottom hint */}
      <div style={{
        marginTop: 48,
        fontSize: 10,
        color: "#ffffff1a",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        fontFamily: "'Courier New', monospace",
        animation: "headerEntrance 1s cubic-bezier(0.16, 1, 0.3, 1) both",
        animationDelay: "0.6s",
      }}>
        your companions · your data · your device
      </div>
    </div>
  );
}
