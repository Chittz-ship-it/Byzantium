import { useState, useEffect, useRef } from "react";

// ── THEME ────────────────────────────────────────────────
const T = {
  bg: "#06100a",
  panel: "#0b1a10",
  border: "#1a3d20",
  borderBright: "#2d6e35",
  gold: "#d4a843",
  green: "#4ade80",
  greenDim: "#1f5c2e",
  text: "#c8ddc0",
  dim: "#3d6b45",
  red: "#f87171",
  amber: "#fbbf24",
  blue: "#93c5fd",
  white: "#e8f5e0",
};

// ── ENEMIES ──────────────────────────────────────────────
const ENEMIES = {
  rabbit: {
    id: "rabbit", name: "Wild Rabbit",
    art: ["  (\\(\\  ", "  (•ᴗ•) ", "  c(\")(\")"],
    color: "#a8e6cf",
    maxHp: 20, atk: 5, def: 1, xp: 14,
    loot: [
      { name: "Rabbit Fur", chance: 0.80, value: 5 },
      { name: "Lucky Foot", chance: 0.22, value: 18 },
      { name: "Soft Pelt",  chance: 0.45, value: 7 },
    ],
    weight: 50,
  },
  vole: {
    id: "vole", name: "Field Vole",
    art: ["  /~v~\\ ", " (·ω·)  ", "  m   m "],
    color: "#d4b896",
    maxHp: 30, atk: 8, def: 3, xp: 24,
    loot: [
      { name: "Vole Pelt",     chance: 0.70, value: 9 },
      { name: "Tiny Bones",    chance: 0.55, value: 4 },
      { name: "Vole Musk",     chance: 0.18, value: 25 },
    ],
    weight: 35,
  },
  fox: {
    id: "fox", name: "Forest Fox",
    art: ["  /^\\/^  ", " (^  ^)  ", "  )    ( "],
    color: "#f97316",
    maxHp: 50, atk: 13, def: 6, xp: 50,
    loot: [
      { name: "Fox Tail",  chance: 0.58, value: 30 },
      { name: "Fox Pelt",  chance: 0.48, value: 22 },
      { name: "Fox Fang",  chance: 0.18, value: 45 },
    ],
    weight: 15,
  },
};

// ── LEVEL SYSTEM ─────────────────────────────────────────
const XP_CURVE = [0, 0, 70, 170, 320, 530, 810, 1170, 1620, 2170, 2840];
const MAX_LEVEL = 10;

const getLevel = (xp) => {
  for (let i = MAX_LEVEL; i >= 1; i--) {
    if (xp >= XP_CURVE[i]) return i;
  }
  return 1;
};

const xpForNext = (lvl) =>
  lvl >= MAX_LEVEL ? XP_CURVE[MAX_LEVEL] : XP_CURVE[lvl + 1];

const calcStats = (lvl) => ({
  maxHp: 35 + lvl * 12,
  atk:    7 + lvl * 2,
  def:    2 + lvl * 1,
});

// ── HELPERS ──────────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const rollLoot = (enemyData) =>
  enemyData.loot
    .filter((l) => Math.random() < l.chance)
    .map((l) => ({ name: l.name, value: l.value }));

const spawnEnemy = () => {
  const pool = Object.values(ENEMIES);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r <= 0) return { ...e, hp: e.maxHp };
  }
  return { ...pool[0], hp: pool[0].maxHp };
};

const mkPlayer = (name) => {
  const s = calcStats(1);
  return { name, xp: 0, gold: 10, inventory: [], hp: s.maxHp };
};

const groupInventory = (inventory) =>
  Object.values(
    inventory.reduce((acc, item) => {
      if (!acc[item.name]) acc[item.name] = { name: item.name, value: item.value, count: 0 };
      acc[item.name].count++;
      return acc;
    }, {})
  );

// ── SHARED UI ────────────────────────────────────────────

const HpBar = ({ current, max, color = T.green }) => {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const barColor = pct > 50 ? color : pct > 25 ? T.amber : T.red;
  return (
    <div style={{ width: "100%", background: "#0a1a0d", borderRadius: 2, height: 8 }}>
      <div style={{ width: `${pct}%`, background: barColor, height: "100%", borderRadius: 2, transition: "width 0.4s ease" }} />
    </div>
  );
};

const XpBar = ({ xp, level }) => {
  if (level >= MAX_LEVEL) return <div style={{ color: T.gold, fontFamily: "'VT323', monospace", fontSize: "0.85rem" }}>— MAX LEVEL —</div>;
  const base = XP_CURVE[level];
  const next = xpForNext(level);
  const pct = ((xp - base) / (next - base)) * 100;
  return (
    <div style={{ width: "100%", background: "#0a1a0d", borderRadius: 2, height: 6 }}>
      <div style={{ width: `${pct}%`, background: T.gold, height: "100%", borderRadius: 2, transition: "width 0.5s ease" }} />
    </div>
  );
};

const Panel = ({ children, style = {} }) => (
  <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4, padding: 14, ...style }}>
    {children}
  </div>
);

const Btn = ({ children, onClick, disabled, variant = "default", style = {} }) => {
  const vs = {
    default: { bg: "#0f2215", color: T.text,  border: T.border },
    primary: { bg: "#0f2e16", color: T.green,  border: T.green  },
    danger:  { bg: "#2e0f0f", color: T.red,    border: T.red    },
    gold:    { bg: "#2e1f00", color: T.gold,   border: T.gold   },
    dim:     { bg: "#0a150d", color: T.dim,    border: T.border },
  };
  const v = vs[variant] || vs.default;
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover && !disabled ? v.bg + "ee" : v.bg,
        color: v.color,
        border: `1px solid ${v.border}`,
        fontFamily: "'VT323', monospace",
        fontSize: "1.05rem",
        padding: "8px 14px",
        borderRadius: 3,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "all 0.15s",
        letterSpacing: "0.04em",
        transform: hover && !disabled ? "translateY(-1px)" : "none",
        ...style,
      }}
    >
      {children}
    </button>
  );
};

const Divider = ({ label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
    <div style={{ flex: 1, height: 1, background: T.border }} />
    {label && <span style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.8rem" }}>{label}</span>}
    <div style={{ flex: 1, height: 1, background: T.border }} />
  </div>
);

const CombatLog = ({ lines }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  const colorLine = (l) => {
    if (l.includes("⚔") || l.includes("You strike")) return T.amber;
    if (l.includes("💀") || l.includes("defeated") || l.includes("unconscious") || l.includes("retaliates") || l.includes("Hit for")) return T.red;
    if (l.includes("✨") || l.includes("XP") || l.includes("Loot") || l.includes("📦")) return T.green;
    if (l.includes("🌟") || l.includes("LEVEL UP")) return T.gold;
    if (l.includes("🏃") || l.includes("fled") || l.includes("dash") || l.includes("escape")) return T.blue;
    return T.text;
  };

  return (
    <div ref={ref} style={{
      background: "#030a05",
      border: `1px solid ${T.border}`,
      borderRadius: 3,
      padding: "10px 12px",
      height: 130,
      overflowY: "auto",
      fontFamily: "'VT323', monospace",
      fontSize: "0.95rem",
      lineHeight: 1.65,
    }}>
      {lines.map((l, i) => (
        <div key={i} style={{ color: colorLine(l) }}>{l}</div>
      ))}
    </div>
  );
};

// ── SCREEN: TITLE ─────────────────────────────────────────
const TitleScreen = ({ onStart }) => (
  <div style={{ textAlign: "center", padding: "36px 20px" }}>
    <pre style={{
      color: T.green, fontFamily: "monospace",
      fontSize: "clamp(0.45rem, 1.8vw, 0.62rem)",
      lineHeight: 1.25, margin: "0 auto 20px", display: "inline-block",
    }}>{
`████████╗ ██████╗ ████████╗ █████╗ ██╗      █████╗
╚══██╔══╝██╔═══██╗╚══██╔══╝██╔══██╗██║     ██╔══██╗
   ██║   ██║   ██║   ██║   ███████║██║     ███████║
   ██║   ██║   ██║   ██║   ██╔══██║██║     ██╔══██║
   ██║   ╚██████╔╝   ██║   ██║  ██║███████╗██║  ██║
   ╚═╝    ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝`}
    </pre>
    <div style={{ color: T.dim, fontFamily: "monospace", fontSize: "0.6rem", marginBottom: 6, letterSpacing: "0.2em" }}>
      ───── OF THE FOREST ─────
    </div>
    <div style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.9rem", marginBottom: 32 }}>
      Hunt · Loot · Level Up
    </div>

    <pre style={{ color: T.dim, fontFamily: "monospace", fontSize: "0.65rem", lineHeight: 1.5, marginBottom: 28 }}>{
`  🌲🌲🌲   🌲  🌲🌲🌲  🌲
  🌲  🌿       🌿   🌲  🌲
 🌲   🌿🌿  🌿    🌿   🌲
🌲🌲🌲🌲🌲🌲🌲🌲🌲🌲🌲🌲`}
    </pre>

    <Btn onClick={onStart} variant="primary" style={{ fontSize: "1.3rem", padding: "12px 36px" }}>
      ▶  BEGIN ADVENTURE
    </Btn>
    <div style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.85rem", marginTop: 20 }}>
      A text RPG — v1.0 · The Forest
    </div>
  </div>
);

// ── SCREEN: NAME ──────────────────────────────────────────
const NameScreen = ({ onConfirm }) => {
  const [name, setName] = useState("");
  const clean = name.trim();
  return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ color: T.gold, fontFamily: "'VT323', monospace", fontSize: "1.5rem", marginBottom: 6 }}>
        WHO ARE YOU, TRAVELLER?
      </div>
      <div style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.95rem", marginBottom: 28 }}>
        The forest remembers all who enter...
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && clean && onConfirm(clean)}
        placeholder="Enter your name..."
        maxLength={18}
        autoFocus
        style={{
          background: T.panel, border: `1px solid ${clean ? T.green : T.border}`,
          color: T.green, fontFamily: "'VT323', monospace", fontSize: "1.25rem",
          padding: "10px 16px", borderRadius: 3, width: "100%", maxWidth: 280,
          outline: "none", textAlign: "center", display: "block", margin: "0 auto 20px",
          transition: "border-color 0.2s",
        }}
      />
      <Btn onClick={() => clean && onConfirm(clean)} variant="primary" disabled={!clean} style={{ fontSize: "1.1rem", padding: "10px 28px" }}>
        CONFIRM →
      </Btn>
    </div>
  );
};

// ── SCREEN: TOWN ──────────────────────────────────────────
const TownScreen = ({ player, level, stats, onForest, onShop, onStats, onRest }) => {
  const atMax = player.hp >= stats.maxHp;
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontFamily: "'VT323', monospace", color: T.gold, fontSize: "1.3rem" }}>
        ⌂  SYLVANTIDE VILLAGE
      </div>
      <div style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.85rem", marginBottom: 14 }}>
        A quiet hamlet on the forest's edge
      </div>

      {/* Player card */}
      <Panel style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ color: T.green, fontFamily: "'VT323', monospace", fontSize: "1.15rem" }}>
            ⚔  {player.name}
          </span>
          <span style={{ color: T.gold, fontFamily: "'VT323', monospace", fontSize: "0.9rem" }}>
            ★ Level {level}  ·  {player.gold}g
          </span>
        </div>
        <div style={{ color: T.text, fontFamily: "'VT323', monospace", fontSize: "0.85rem", marginBottom: 3 }}>
          HP  {player.hp} / {stats.maxHp}
        </div>
        <HpBar current={player.hp} max={stats.maxHp} />
        <div style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.78rem", marginTop: 8, marginBottom: 3 }}>
          {level < MAX_LEVEL ? `XP  ${player.xp} / ${xpForNext(level)}  →  Lv${level + 1}` : "✦ MAX LEVEL REACHED ✦"}
        </div>
        <XpBar xp={player.xp} level={level} />
      </Panel>

      {/* Scene */}
      <Panel style={{ marginBottom: 14, textAlign: "center", padding: "10px 14px" }}>
        <pre style={{ color: T.dim, fontFamily: "monospace", fontSize: "0.68rem", lineHeight: 1.5, margin: 0 }}>{
`  🌲 🌲  [SHOP]  🌲 🌲 🌲
  🌲  🌿  ─────  🌿  🌲
   🌲   🌿    🌿   🌲  🌲
  ━━━━━━━━━━━━━━━━━━━━━━`}
        </pre>
        <div style={{ color: T.text, fontFamily: "'VT323', monospace", fontSize: "0.9rem", marginTop: 8 }}>
          The Forest looms darkly to the north...
        </div>
      </Panel>

      {/* Action grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Btn onClick={onForest} variant="primary" style={{ padding: 12, fontSize: "1rem" }}>
          🌲 Enter Forest
        </Btn>
        <Btn onClick={onShop} variant="gold" style={{ padding: 12, fontSize: "1rem" }}>
          🏪 Merchant
        </Btn>
        <Btn onClick={onStats} style={{ padding: 12, fontSize: "1rem" }}>
          📜 Stats
        </Btn>
        <Btn onClick={onRest} disabled={atMax} variant={atMax ? "dim" : "default"} style={{ padding: 12, fontSize: "1rem" }}>
          🛏 Rest {atMax ? "(Full)" : "(Free)"}
        </Btn>
      </div>

      {player.inventory.length > 0 && (
        <div style={{
          marginTop: 12, padding: "8px 12px",
          background: "#1f1500", border: `1px solid ${T.gold}`,
          borderRadius: 3, color: T.gold,
          fontFamily: "'VT323', monospace", fontSize: "0.9rem", textAlign: "center",
        }}>
          ⚠  {player.inventory.length} item{player.inventory.length !== 1 ? "s" : ""} waiting to be sold
        </div>
      )}
    </div>
  );
};

// ── SCREEN: COMBAT ────────────────────────────────────────
const CombatScreen = ({ player, stats, enemy, log, phase, onAttack, onFlee, onReturn, onHuntAgain }) => (
  <div style={{ padding: 16 }}>
    <div style={{ color: T.red, fontFamily: "'VT323', monospace", fontSize: "1.2rem", marginBottom: 10 }}>
      ⚔  COMBAT — {enemy.name.toUpperCase()}
    </div>

    {/* HP bars */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
      <Panel style={{ padding: 10 }}>
        <div style={{ color: T.green, fontFamily: "'VT323', monospace", fontSize: "0.95rem" }}>{player.name}</div>
        <div style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.78rem" }}>HP {player.hp}/{stats.maxHp}</div>
        <HpBar current={player.hp} max={stats.maxHp} />
      </Panel>
      <Panel style={{ padding: 10 }}>
        <div style={{ color: enemy.color, fontFamily: "'VT323', monospace", fontSize: "0.95rem" }}>{enemy.name}</div>
        <div style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.78rem" }}>HP {enemy.hp}/{enemy.maxHp}</div>
        <HpBar current={enemy.hp} max={enemy.maxHp} color={T.red} />
      </Panel>
    </div>

    {/* Enemy art */}
    <Panel style={{ textAlign: "center", marginBottom: 10, padding: "12px 10px" }}>
      <pre style={{
        color: enemy.hp > 0 ? enemy.color : T.dim,
        fontFamily: "monospace",
        fontSize: "1.15rem",
        lineHeight: 1.5,
        margin: 0,
        opacity: enemy.hp <= 0 ? 0.3 : 1,
        transition: "opacity 0.4s",
      }}>
        {enemy.art.join("\n")}
      </pre>
      {enemy.hp <= 0 && (
        <div style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.85rem", marginTop: 4 }}>
          ✝  DEFEATED
        </div>
      )}
    </Panel>

    <CombatLog lines={log} />

    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      {phase === "player_turn" && (
        <>
          <Btn onClick={onAttack} variant="primary" style={{ flex: 1 }}>⚔ Attack</Btn>
          <Btn onClick={onFlee}   variant="danger"  style={{ flex: 1 }}>🏃 Flee</Btn>
        </>
      )}
      {phase === "victory" && (
        <>
          <Btn onClick={onHuntAgain} variant="primary" style={{ flex: 1 }}>⚔ Hunt Again</Btn>
          <Btn onClick={onReturn}    variant="gold"    style={{ flex: 1 }}>⌂ Village</Btn>
        </>
      )}
      {(phase === "defeat" || phase === "fled") && (
        <Btn onClick={onReturn} variant="gold" style={{ flex: 1, fontSize: "1.05rem" }}>
          {phase === "defeat" ? "💀 Retreat to Village" : "⌂ Return to Village"}
        </Btn>
      )}
    </div>
  </div>
);

// ── SCREEN: SHOP ──────────────────────────────────────────
const ShopScreen = ({ player, onSell, onSellAll, onBack }) => {
  const items = groupInventory(player.inventory);
  const total = player.inventory.reduce((s, i) => s + i.value, 0);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ color: T.gold, fontFamily: "'VT323', monospace", fontSize: "1.3rem" }}>
        🏪 TRADER MIRO'S POST
      </div>
      <div style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.85rem", marginBottom: 14 }}>
        "I'll buy whatever the forest gives you."
      </div>

      <Panel style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ color: T.text, fontFamily: "'VT323', monospace" }}>Your Gold</span>
          <span style={{ color: T.gold, fontFamily: "'VT323', monospace", fontSize: "1.1rem" }}>{player.gold}g</span>
        </div>

        <Divider label="INVENTORY" />

        {items.length === 0 ? (
          <div style={{ color: T.dim, fontFamily: "'VT323', monospace", textAlign: "center", padding: "18px 0" }}>
            Nothing to sell — hunt some creatures!
          </div>
        ) : (
          <>
            {items.map((item) => (
              <div key={item.name} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "7px 0", borderBottom: `1px solid ${T.border}`,
              }}>
                <div>
                  <div style={{ color: T.text, fontFamily: "'VT323', monospace", fontSize: "0.95rem" }}>
                    {item.name}  <span style={{ color: T.dim }}>×{item.count}</span>
                  </div>
                  <div style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.78rem" }}>
                    {item.value}g each
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: T.gold, fontFamily: "'VT323', monospace" }}>
                    {item.value * item.count}g
                  </span>
                  <Btn onClick={() => onSell(item.name)} variant="gold" style={{ padding: "4px 10px", fontSize: "0.85rem" }}>
                    Sell
                  </Btn>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <Btn onClick={onSellAll} variant="gold" style={{ width: "100%", fontSize: "1.05rem", padding: 10 }}>
                ✦  Sell All  ({total}g)
              </Btn>
            </div>
          </>
        )}
      </Panel>
      <Btn onClick={onBack} style={{ width: "100%" }}>← Back to Village</Btn>
    </div>
  );
};

// ── SCREEN: STATS ─────────────────────────────────────────
const StatsScreen = ({ player, level, stats, onBack }) => {
  const items = groupInventory(player.inventory);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ color: T.gold, fontFamily: "'VT323', monospace", fontSize: "1.3rem", marginBottom: 14 }}>
        📜 ADVENTURER'S RECORD
      </div>

      <Panel style={{ marginBottom: 12 }}>
        <div style={{ color: T.green, fontFamily: "'VT323', monospace", fontSize: "1.3rem" }}>{player.name}</div>
        <div style={{ color: T.gold, fontFamily: "'VT323', monospace", fontSize: "0.95rem", marginBottom: 12 }}>
          ★  Level {level} Adventurer
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px" }}>
          {[
            ["❤  HP",      `${player.hp} / ${stats.maxHp}`],
            ["⚔  Attack",  stats.atk],
            ["🛡  Defence", stats.def],
            ["💰 Gold",     `${player.gold}g`],
            ["✨ XP",       player.xp],
            ["🎯 Next Lv",  level < MAX_LEVEL ? xpForNext(level) : "MAX"],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.75rem" }}>{label}</div>
              <div style={{ color: T.white, fontFamily: "'VT323', monospace", fontSize: "1.05rem" }}>{val}</div>
            </div>
          ))}
        </div>

        <Divider />
        <div style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.78rem", marginBottom: 4 }}>
          {level < MAX_LEVEL
            ? `Progress to Level ${level + 1}:  ${player.xp - XP_CURVE[level]} / ${xpForNext(level) - XP_CURVE[level]} XP`
            : "Maximum level achieved — you are a legend."}
        </div>
        <XpBar xp={player.xp} level={level} />
      </Panel>

      <Panel style={{ marginBottom: 12 }}>
        <div style={{ color: T.amber, fontFamily: "'VT323', monospace", fontSize: "0.95rem", marginBottom: 8 }}>
          INVENTORY  ({player.inventory.length} items)
        </div>
        {items.length === 0 ? (
          <div style={{ color: T.dim, fontFamily: "'VT323', monospace" }}>— Empty —</div>
        ) : (
          items.map((item) => (
            <div key={item.name} style={{
              display: "flex", justifyContent: "space-between",
              fontFamily: "'VT323', monospace", color: T.text,
              padding: "5px 0", borderBottom: `1px solid ${T.border}`,
            }}>
              <span>{item.name}  <span style={{ color: T.dim }}>×{item.count}</span></span>
              <span style={{ color: T.gold }}>{item.value * item.count}g</span>
            </div>
          ))
        )}
      </Panel>

      <Btn onClick={onBack} style={{ width: "100%" }}>← Back</Btn>
    </div>
  );
};

// ── APP ───────────────────────────────────────────────────
export default function App() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=VT323&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  const [screen, setScreen]         = useState("title");
  const [player, setPlayer]         = useState(null);
  const [enemy, setEnemy]           = useState(null);
  const [combatLog, setCombatLog]   = useState([]);
  const [combatPhase, setCombatPhase] = useState("player_turn");
  const [prevScreen, setPrevScreen] = useState("town");

  const level = player ? getLevel(player.xp) : 1;
  const stats = calcStats(level);

  // ── Name confirmed ────────────────────────────────────
  const handleName = (name) => {
    setPlayer(mkPlayer(name));
    setScreen("town");
  };

  // ── Rest ──────────────────────────────────────────────
  const handleRest = () => setPlayer((p) => ({ ...p, hp: stats.maxHp }));

  // ── Start / continue fight ────────────────────────────
  const startFight = (e) => {
    setEnemy(e);
    setCombatLog([
      "You step into the shadowed forest...",
      `A ${e.name} lunges from the undergrowth!`,
    ]);
    setCombatPhase("player_turn");
    setScreen("combat");
  };

  const handleForest = () => startFight(spawnEnemy());

  const handleHuntAgain = () => startFight(spawnEnemy());

  // ── Attack ────────────────────────────────────────────
  const handleAttack = () => {
    if (combatPhase !== "player_turn") return;
    const newLog = [];

    // Player hits enemy
    const pDmg = Math.max(1, stats.atk + rand(-2, 4) - enemy.def);
    const newEnemyHp = Math.max(0, enemy.hp - pDmg);
    newLog.push(`⚔ You strike for ${pDmg} damage!`);

    if (newEnemyHp <= 0) {
      const drops  = rollLoot(enemy);
      const xpGain = enemy.xp;
      const newXp  = player.xp + xpGain;
      const newLvl = getLevel(newXp);
      const ns     = calcStats(newLvl);
      const lvUp   = newLvl > level;

      newLog.push(`💀 The ${enemy.name} collapses!`);
      newLog.push(`✨ +${xpGain} XP earned!`);
      if (drops.length > 0)
        newLog.push(`📦 Loot: ${drops.map((d) => d.name).join(", ")}`);
      if (lvUp)
        newLog.push(`🌟 LEVEL UP!  You are now Level ${newLvl}!`);

      setEnemy((e) => ({ ...e, hp: 0 }));
      setPlayer((p) => ({
        ...p,
        xp: newXp,
        maxHp: ns.maxHp,
        hp: Math.min(p.hp + 5, ns.maxHp),
        inventory: [...p.inventory, ...drops],
      }));
      setCombatLog((prev) => [...prev, ...newLog]);
      setCombatPhase("victory");
      return;
    }

    // Enemy retaliates
    const eDmg = Math.max(1, enemy.atk + rand(-2, 3) - stats.def);
    const newPlayerHp = Math.max(0, player.hp - eDmg);
    newLog.push(`🐾 The ${enemy.name} retaliates for ${eDmg}!`);

    if (newPlayerHp <= 0) {
      newLog.push(`💀 You fall unconscious...`);
      newLog.push(`You wake in Sylvantide, battered.`);
      setEnemy((e) => ({ ...e, hp: newEnemyHp }));
      setPlayer((p) => ({ ...p, hp: Math.max(1, Math.floor(stats.maxHp * 0.3)) }));
      setCombatLog((prev) => [...prev, ...newLog]);
      setCombatPhase("defeat");
      return;
    }

    setEnemy((e) => ({ ...e, hp: newEnemyHp }));
    setPlayer((p) => ({ ...p, hp: newPlayerHp }));
    setCombatLog((prev) => [...prev, ...newLog]);
  };

  // ── Flee ──────────────────────────────────────────────
  const handleFlee = () => {
    if (Math.random() > 0.42) {
      setCombatLog((prev) => [...prev, "🏃 You dash back to the treeline!"]);
      setCombatPhase("fled");
    } else {
      const eDmg = Math.max(1, enemy.atk - stats.def);
      setPlayer((p) => ({ ...p, hp: Math.max(1, p.hp - eDmg) }));
      setCombatLog((prev) => [
        ...prev,
        `🐾 Failed to flee! Hit for ${eDmg} as you turn!`,
      ]);
    }
  };

  // ── Shop ──────────────────────────────────────────────
  const handleSell = (itemName) =>
    setPlayer((p) => {
      const idx = p.inventory.findIndex((i) => i.name === itemName);
      if (idx === -1) return p;
      const item = p.inventory[idx];
      const inv  = [...p.inventory];
      inv.splice(idx, 1);
      return { ...p, gold: p.gold + item.value, inventory: inv };
    });

  const handleSellAll = () =>
    setPlayer((p) => ({
      ...p,
      gold: p.gold + p.inventory.reduce((s, i) => s + i.value, 0),
      inventory: [],
    }));

  // ── Render ────────────────────────────────────────────
  return (
    <div style={{
      background: T.bg,
      minHeight: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      padding: "16px 8px",
      fontFamily: "'VT323', monospace",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        boxShadow: `0 0 60px rgba(74,222,128,0.06), 0 0 0 1px ${T.greenDim}22`,
        overflow: "hidden",
      }}>
        {/* Top bar */}
        <div style={{
          background: T.panel,
          borderBottom: `1px solid ${T.border}`,
          padding: "7px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.85rem", letterSpacing: "0.12em" }}>
            TALES OF THE FOREST
          </span>
          {player && (
            <span style={{ color: T.gold, fontFamily: "'VT323', monospace", fontSize: "0.82rem" }}>
              Lv{level}  ·  {player.gold}g
            </span>
          )}
        </div>

        {/* Screens */}
        {screen === "title" && <TitleScreen onStart={() => setScreen("name")} />}

        {screen === "name" && <NameScreen onConfirm={handleName} />}

        {screen === "town" && player && (
          <TownScreen
            player={player}
            level={level}
            stats={stats}
            onForest={handleForest}
            onShop={() => setScreen("shop")}
            onStats={() => { setPrevScreen("town"); setScreen("stats"); }}
            onRest={handleRest}
          />
        )}

        {screen === "combat" && player && enemy && (
          <CombatScreen
            player={player}
            stats={stats}
            enemy={enemy}
            log={combatLog}
            phase={combatPhase}
            onAttack={handleAttack}
            onFlee={handleFlee}
            onReturn={() => setScreen("town")}
            onHuntAgain={handleHuntAgain}
          />
        )}

        {screen === "shop" && player && (
          <ShopScreen
            player={player}
            onSell={handleSell}
            onSellAll={handleSellAll}
            onBack={() => setScreen("town")}
          />
        )}

        {screen === "stats" && player && (
          <StatsScreen
            player={player}
            level={level}
            stats={stats}
            onBack={() => setScreen(prevScreen)}
          />
        )}

        {/* Footer */}
        <div style={{
          borderTop: `1px solid ${T.border}`,
          padding: "6px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ color: "#1a3320", fontFamily: "'VT323', monospace", fontSize: "0.72rem" }}>
            The Forest · Zone 1
          </span>
          {player && screen !== "title" && screen !== "name" && screen !== "combat" && (
            <span
              onClick={() => { setPrevScreen(screen); setScreen("stats"); }}
              style={{ color: T.dim, fontFamily: "'VT323', monospace", fontSize: "0.72rem", cursor: "pointer" }}
            >
              [ stats ]
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
