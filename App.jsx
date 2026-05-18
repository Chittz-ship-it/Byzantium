import { useState, useEffect, useRef } from "react";

// ── NVIDIA API ─────────────────────────────────────────────
const NVIDIA_API_KEY = "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";
const NVIDIA_MODEL   = "deepseek-ai/deepseek-v4-pro";

const callNVIDIA = async (messages) => {
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages,
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16384,
      stream: false,
      chat_template_kwargs: { thinking: false },
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA API ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
};

const parseJSON = (text) => {
  try {
    const clean = text
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const s = Math.min(
      clean.indexOf("{") === -1 ? Infinity : clean.indexOf("{"),
      clean.indexOf("[") === -1 ? Infinity : clean.indexOf("[")
    );
    return JSON.parse(clean.slice(s));
  } catch { return null; }
};

// ── ZONE GENERATION ───────────────────────────────────────
const ZONE_CFG = {
  "Churchyard Map":  { theme:"The Churchyard",  flavor:"crumbling gravestones, undead, zealots, corrupted clergy",      hpMult:1.4, atkMult:1.4 },
  "Swamp Map":       { theme:"The Swamp",        flavor:"murky bog, swamp witches, diseased beasts, cursed fishermen",   hpMult:1.8, atkMult:1.8 },
  "Spiritworld Map": { theme:"The Spiritworld",  flavor:"spectral entities, ancient spirits, void horrors, soul traders", hpMult:2.4, atkMult:2.4 },
};

const fixLoot = (loot) => {
  if (!loot || !loot.length) return [{ name:"nothing", weight:100 }];
  const sum = loot.reduce((s,l) => s+(l.weight||0), 0);
  if (sum === 100) return loot;
  const ni = loot.findIndex(l => l.name==="nothing");
  if (ni !== -1) { const r=[...loot]; r[ni]={...r[ni],weight:r[ni].weight+(100-sum)}; return r; }
  return [...loot, { name:"nothing", weight:100-sum }];
};

const generateZone = async (mapName, level, atk, def) => {
  const cfg = ZONE_CFG[mapName] || { theme:"Unknown Lands", flavor:"strange creatures", hpMult:1.5, atkMult:1.5 };
  const cHp  = Math.round(150 * cfg.hpMult);
  const cAtk = Math.round(40  * cfg.atkMult);
  const cDef = Math.round(12  * cfg.hpMult);
  const cXp  = Math.round(200 * cfg.hpMult);

  const prompt =
`You are a game designer for dark fantasy RPG Byzantium. Generate zone "${cfg.theme}".
Theme: ${cfg.flavor}. Player: Lv${level} ATK${atk} DEF${def}.

Return ONLY raw JSON. No markdown. No explanation. Start immediately with {

{
  "zoneName": "${cfg.theme}",
  "description": "One dark atmospheric sentence.",
  "campDescription": "One sentence about the small safe camp here.",
  "enemies": [
    {
      "id":"unique_id","name":"Enemy Name",
      "art":["  (art1)  ","  (art2)  ","  (art3)  "],
      "color":"#hexcolor","maxHp":${cHp},"atk":${cAtk},"def":${cDef},"xp":${cXp},"weight":24,
      "loot":[
        {"name":"Thematic Drop","weight":50,"value":60},
        {"name":"Secondary Drop","weight":20,"value":30},
        {"name":"Rare Drop","weight":2,"value":180},
        {"name":"nothing","weight":28}
      ]
    }
  ]
}

RULES — violating any rule makes the output unusable:
1. Exactly 4 enemies weight:24 (common) and 2 enemies weight:1 (rare). Total 6 enemies.
2. Every loot array must sum to exactly 100.
3. Common enemy HP ${Math.round(cHp*0.8)}–${Math.round(cHp*1.3)}, ATK ${Math.round(cAtk*0.8)}–${Math.round(cAtk*1.2)}, DEF ${Math.round(cDef*0.7)}–${Math.round(cDef*1.3)}.
4. One rare enemy is a powerful boss (HP ${Math.round(cHp*2.5)}+, weight:1).
5. All enemy IDs unique snake_case. All art arrays exactly 3 strings ~9 chars each.
6. Loot names thematic to ${cfg.theme}. Value range 40–250g.
7. XP range ${Math.round(cXp*0.7)}–${Math.round(cXp*1.8)}.`;

  const raw  = await callNVIDIA([{ role:"user", content:prompt }]);
  const data = parseJSON(raw);
  if (!data || !Array.isArray(data.enemies) || data.enemies.length < 4) return null;
  data.id      = mapName.replace(" Map","").toLowerCase().replace(/\s+/g,"_");
  data.mapName = mapName;
  data.enemies = data.enemies.map(e => ({ ...e, hp:e.maxHp, loot:fixLoot(e.loot) }));
  return data;
};

// ── TALENT GENERATION ─────────────────────────────────────
const TALENT_FALLBACK = [
  { id:"iron_skin",     name:"Iron Skin",      description:"+6 DEF permanently",      effect:"def",    value:6    },
  { id:"battle_fury",   name:"Battle Fury",    description:"+8 ATK permanently",      effect:"atk",    value:8    },
  { id:"warriors_heart",name:"Warrior's Heart",description:"+40 max HP permanently",  effect:"hp",     value:40   },
];

const generateTalents = async (level, critPct, hasHD, flatAtk, flatDef) => {
  const prompt =
`Generate 3 distinct permanent talent choices for a dark fantasy RPG.
Player: Lv${level}, Crit ${critPct}%, Evasion ${hasHD?"yes":"no"}, BonusATK ${flatAtk}, BonusDEF ${flatDef}.

Return ONLY a raw JSON array. No markdown. Start with [

[
  {"id":"talent_id","name":"Talent Name","description":"Short effect description","effect":"atk","value":6}
]

RULES:
- Exactly 3 talents, all different effects.
- Valid effects: "atk" (val 4–10), "def" (val 3–8), "hp" (val 25–60), "crit" (val 0.01–0.03 as decimal), "flee" (val 0.10–0.20), "evasion" (val 0.01), "holy_perm" (val 5–15 permanent holy dmg/swing).
- Names must be dark fantasy flavored e.g. "Bloodied Fists", "Forsaken Resilience", "Shadow Step".
- No two talents share an effect.
- Description must clearly state the mechanical benefit.`;

  const raw    = await callNVIDIA([{ role:"user", content:prompt }]);
  const parsed = parseJSON(raw);
  if (!Array.isArray(parsed) || parsed.length < 3) return TALENT_FALLBACK;
  return parsed.slice(0,3);
};

// ── THEME ─────────────────────────────────────────────────
const T = {
  bg:"#06100a",panel:"#0b1a10",border:"#1a3d20",borderBright:"#2d6e35",
  gold:"#d4a843",green:"#4ade80",greenDim:"#1f5c2e",text:"#c8ddc0",
  dim:"#3d6b45",red:"#f87171",amber:"#fbbf24",blue:"#93c5fd",
  purple:"#c084fc",white:"#e8f5e0",steel:"#94a3b8",
};

// ── HELPERS ───────────────────────────────────────────────
const rand = (min,max) => Math.floor(Math.random()*(max-min+1))+min;

const rollLootTable = (table, flags={}) => {
  const r = Math.random()*100; let cum=0;
  for (const e of table){
    cum += e.weight;
    if (r < cum){
      if (e.name==="nothing") return [];
      if (e.unique && flags[e.uniqueFlag]) return [];
      const v = typeof e.value==="function" ? e.value() : (e.value??0);
      return [{ name:e.name, value:Math.floor(v) }];
    }
  }
  return [];
};

// ── SPECIAL ITEMS ─────────────────────────────────────────
const SPECIAL = {
  "Warm Ale":                { type:"usable",  healMin:15, healMax:25 },
  "Warm Milk":               { type:"usable",  healMin:30, healMax:45 },
  "Sack of Coin":            { type:"openable",goldMin:10, goldMax:20 },
  "Large Sack of Coin":      { type:"openable",goldMin:20, goldMax:40 },
  "Merchant Seal":           { type:"key",     desc:"+10% gold from merchant" },
  "Mountain Map":            { type:"key",     desc:"Unlocks The Mountain zone" },
  "Headdress":               { type:"key",     desc:"+1% evasion in combat" },
  "Treasure Key":            { type:"key",     desc:"Opens treasure chests · Coming soon" },
  "Talent Chit":             { type:"talent",  desc:"Choose a permanent talent · Use to activate" },
  "Churchyard Map":          { type:"map",     desc:"The old churchyard awaits · Use to generate zone" },
  "Swamp Map":               { type:"map",     desc:"The dark swamp lurks · Use to generate zone" },
  "Spiritworld Map":         { type:"map",     desc:"The veil between worlds · Use to generate zone" },
  "Book: Solid Strikes V1":  { type:"book",    desc:"+1% crit · Critical hits deal double damage", effect:"solidStrikes" },
  "Book: Iron Will":         { type:"book",    desc:"Permanently +5 DEF",             effect:"ironWill"     },
  "Book: Battle Hymn":       { type:"book",    desc:"Permanently +5 ATK",             effect:"battleHymn"   },
  "Book: Swift Feet":        { type:"book",    desc:"+15% flee success rate",          effect:"swiftFeet"    },
  "Book: Expansive Mind":    { type:"book",    desc:"Raises level cap from 10 to 15", effect:"expandedMind" },
  "Recipe for Shadowfang ★": { type:"recipe",  desc:"Alt forge: Shadowfang ★ · Shadowfang + 5 bone types" },
  "Recipe: Shadowfang":      { type:"recipe",  desc:"Forge Shadowfang · Forest Blade + 3 Fox Pelts"        },
  "Recipe: Shadow Cloak":    { type:"recipe",  desc:"Forge Shadow Cloak · Iron Plate + 2 Boar Hides"       },
  "Recipe: King's Seal":     { type:"recipe",  desc:"Forge King's Seal · Defender's Band + Crown of Tusks" },
  "Recipe: Void Shard":      { type:"recipe",  desc:"Forge Void Shard · Moonstone Drop + Silver Earring"   },
};

const isSellable   = (n) => !SPECIAL[n];
const hasSeal      = (p) => p.inventory.some(i=>i.name==="Merchant Seal");
const hasMap       = (p) => p.inventory.some(i=>i.name==="Mountain Map");
const hasHeaddress = (p) => p.inventory.some(i=>i.name==="Headdress");
const sellValue    = (p,v) => hasSeal(p) ? Math.floor(v*1.1) : v;
const checkEvade   = (p) => hasHeaddress(p) && Math.random()<0.01;
const holyDmg      = (p) => {
  const perm = p.holyPermDmg||0;
  const temp = Date.now()<(p.holyExpiry||0) ? 10 : 0;
  return perm+temp;
};
const hasHoly      = (p) => holyDmg(p)>0;

// ── SHOP ──────────────────────────────────────────────────
const SHOP = {
  weapons:[
    {id:"stick",      name:"Gnarled Stick",   slot:"weapon",cost:0,   atk:0 },
    {id:"dagger",     name:"Rusty Dagger",     slot:"weapon",cost:25,  atk:3 },
    {id:"sword",      name:"Iron Sword",        slot:"weapon",cost:80,  atk:8 },
    {id:"blade",      name:"Forest Blade",      slot:"weapon",cost:200, atk:16},
    {id:"shadowfang", name:"Shadowfang",        slot:"weapon",cost:500, atk:28},
  ],
  armour:[
    {id:"rags",   name:"Tattered Rags",  slot:"armour",cost:0,  def:0, hp:0 },
    {id:"leather",name:"Leather Jerkin", slot:"armour",cost:30, def:2, hp:10},
    {id:"chain",  name:"Chainmail Vest", slot:"armour",cost:100,def:5, hp:22},
    {id:"plate",  name:"Iron Plate",     slot:"armour",cost:250,def:10,hp:40},
    {id:"shadow", name:"Shadow Cloak",   slot:"armour",cost:600,def:16,hp:65},
  ],
  rings:[
    {id:"copper_ring",   name:"Copper Ring",    slot:"ring",cost:40, atk:1,def:1      },
    {id:"jade_band",     name:"Jade Band",       slot:"ring",cost:120,hp:28            },
    {id:"blood_ring",    name:"Blood Ring",      slot:"ring",cost:300,atk:6            },
    {id:"defender_band", name:"Defender's Band", slot:"ring",cost:180,def:6            },
    {id:"kings_seal",    name:"King's Seal",     slot:"ring",cost:550,atk:5,def:4,hp:20},
  ],
  earrings:[
    {id:"bone_hook",  name:"Bone Hook",       slot:"earring",cost:35, def:2           },
    {id:"silver_drop",name:"Silver Drop",      slot:"earring",cost:90, atk:2,def:1    },
    {id:"hunters",    name:"Hunter's Earring", slot:"earring",cost:160,atk:5          },
    {id:"moonstone",  name:"Moonstone Drop",   slot:"earring",cost:350,atk:3,hp:22   },
    {id:"void_shard", name:"Void Shard",       slot:"earring",cost:620,atk:8,def:3,hp:15},
  ],
};
const DEFAULT_EQUIP={weapon:SHOP.weapons[0],armour:SHOP.armour[0],ring:null,earring:null};

const statLabel=(item)=>{
  if(!item) return "—";
  const p=[];
  if(item.atk) p.push(`+${item.atk} ATK`);
  if(item.def) p.push(`+${item.def} DEF`);
  if(item.hp)  p.push(`+${item.hp} HP`);
  return p.join("  ")||"—";
};

// ── BLACKSMITH RECIPES ────────────────────────────────────
const RECIPES=[
  {id:"headdress",requiresRecipe:null,name:"Headdress",flavor:"Woven from five enchanted feathers.",outputDesc:"Key Item · +1% evasion",
   ingredients:[{label:"Red Feather",has:p=>p.inventory.some(i=>i.name==="Red Feather")},{label:"Blue Feather",has:p=>p.inventory.some(i=>i.name==="Blue Feather")},{label:"Green Feather",has:p=>p.inventory.some(i=>i.name==="Green Feather")},{label:"Orange Feather",has:p=>p.inventory.some(i=>i.name==="Orange Feather")},{label:"Purple Feather",has:p=>p.inventory.some(i=>i.name==="Purple Feather")}],
   canCraft:p=>["Red Feather","Blue Feather","Green Feather","Orange Feather","Purple Feather"].every(f=>p.inventory.some(i=>i.name===f)),
   alreadyHave:p=>p.inventory.some(i=>i.name==="Headdress"),
   forge:p=>{let inv=[...p.inventory];for(const f of["Red Feather","Blue Feather","Green Feather","Orange Feather","Purple Feather"]){const x=inv.findIndex(i=>i.name===f);if(x!==-1)inv.splice(x,1);}inv.push({name:"Headdress",value:0});return{...p,inventory:inv};}},
  {id:"shadowfang_plus",requiresRecipe:null,name:"Shadowfang ★",flavor:"Imbued with purple fox essence.",outputDesc:"Weapon · +42 ATK",
   ingredients:[{label:"Shadowfang (equipped)",has:p=>p.equipment.weapon?.id==="shadowfang"},{label:"Purple Fox Pelt",has:p=>p.inventory.some(i=>i.name==="Purple Fox Pelt")}],
   canCraft:p=>p.equipment.weapon?.id==="shadowfang"&&p.inventory.some(i=>i.name==="Purple Fox Pelt"),
   alreadyHave:p=>["shadowfang_plus","shadowfang_plus_alt"].includes(p.equipment.weapon?.id),
   forge:p=>{const u={id:"shadowfang_plus",name:"Shadowfang ★",slot:"weapon",cost:0,atk:42};let inv=[...p.inventory];const x=inv.findIndex(i=>i.name==="Purple Fox Pelt");if(x!==-1)inv.splice(x,1);return{...p,inventory:inv,equipment:{...p.equipment,weapon:u}};}},
  {id:"warlords_cloak",requiresRecipe:null,name:"Warlord's Cloak",flavor:"Shadow Cloak reinforced with boar hide.",outputDesc:"Armour · +18 DEF · +80 HP",
   ingredients:[{label:"Shadow Cloak (equipped)",has:p=>p.equipment.armour?.id==="shadow"},{label:"Boar Hide",has:p=>p.inventory.some(i=>i.name==="Boar Hide")}],
   canCraft:p=>p.equipment.armour?.id==="shadow"&&p.inventory.some(i=>i.name==="Boar Hide"),
   alreadyHave:p=>p.equipment.armour?.id==="warlords_cloak",
   forge:p=>{const u={id:"warlords_cloak",name:"Warlord's Cloak",slot:"armour",cost:0,def:18,hp:80};let inv=[...p.inventory];const x=inv.findIndex(i=>i.name==="Boar Hide");if(x!==-1)inv.splice(x,1);const eq={...p.equipment,armour:u};return{...p,inventory:inv,equipment:eq,hp:Math.min(p.hp,calcStats(getLevel(p.xp,p.maxLevel),eq).maxHp)};}},
  {id:"amethyst_seal",requiresRecipe:null,name:"King's Amethyst Seal",flavor:"The King's Seal set with an amethyst.",outputDesc:"Ring · +8 ATK · +6 DEF · +25 HP",
   ingredients:[{label:"King's Seal (equipped ring)",has:p=>p.equipment.ring?.id==="kings_seal"},{label:"Amethyst",has:p=>p.inventory.some(i=>i.name==="Amethyst")}],
   canCraft:p=>p.equipment.ring?.id==="kings_seal"&&p.inventory.some(i=>i.name==="Amethyst"),
   alreadyHave:p=>p.equipment.ring?.id==="amethyst_seal",
   forge:p=>{const u={id:"amethyst_seal",name:"King's Amethyst Seal",slot:"ring",cost:0,atk:8,def:6,hp:25};let inv=[...p.inventory];const x=inv.findIndex(i=>i.name==="Amethyst");if(x!==-1)inv.splice(x,1);const eq={...p.equipment,ring:u};return{...p,inventory:inv,equipment:eq,hp:Math.min(p.hp,calcStats(getLevel(p.xp,p.maxLevel),eq).maxHp)};}},
  {id:"void_shard_plus",requiresRecipe:null,name:"Void Shard ★",flavor:"The Void Shard threaded with silver.",outputDesc:"Earring · +12 ATK · +5 DEF · +22 HP",
   ingredients:[{label:"Void Shard (equipped earring)",has:p=>p.equipment.earring?.id==="void_shard"},{label:"Silver Earring",has:p=>p.inventory.some(i=>i.name==="Silver Earring")}],
   canCraft:p=>p.equipment.earring?.id==="void_shard"&&p.inventory.some(i=>i.name==="Silver Earring"),
   alreadyHave:p=>p.equipment.earring?.id==="void_shard_plus",
   forge:p=>{const u={id:"void_shard_plus",name:"Void Shard ★",slot:"earring",cost:0,atk:12,def:5,hp:22};let inv=[...p.inventory];const x=inv.findIndex(i=>i.name==="Silver Earring");if(x!==-1)inv.splice(x,1);const eq={...p.equipment,earring:u};return{...p,inventory:inv,equipment:eq,hp:Math.min(p.hp,calcStats(getLevel(p.xp,p.maxLevel),eq).maxHp)};}},
  {id:"shadowfang_plus_alt",requiresRecipe:"Recipe for Shadowfang ★",name:"Shadowfang ★ (Alt)",flavor:"Five bone types fused into the blade.",outputDesc:"Weapon · +42 ATK",
   ingredients:[{label:"Shadowfang (equipped)",has:p=>p.equipment.weapon?.id==="shadowfang"},{label:"Tiny Bones",has:p=>p.inventory.some(i=>i.name==="Tiny Bones")},{label:"Mini Bones",has:p=>p.inventory.some(i=>i.name==="Mini Bones")},{label:"Small Bones",has:p=>p.inventory.some(i=>i.name==="Small Bones")},{label:"Boar Bones",has:p=>p.inventory.some(i=>i.name==="Boar Bones")},{label:"Magic Bones",has:p=>p.inventory.some(i=>i.name==="Magic Bones")}],
   canCraft:p=>p.equipment.weapon?.id==="shadowfang"&&["Tiny Bones","Mini Bones","Small Bones","Boar Bones","Magic Bones"].every(b=>p.inventory.some(i=>i.name===b)),
   alreadyHave:p=>["shadowfang_plus","shadowfang_plus_alt"].includes(p.equipment.weapon?.id),
   forge:p=>{const u={id:"shadowfang_plus_alt",name:"Shadowfang ★",slot:"weapon",cost:0,atk:42};let inv=[...p.inventory];for(const b of["Tiny Bones","Mini Bones","Small Bones","Boar Bones","Magic Bones"]){const x=inv.findIndex(i=>i.name===b);if(x!==-1)inv.splice(x,1);}return{...p,inventory:inv,equipment:{...p.equipment,weapon:u}};}},
  {id:"craft_shadowfang",requiresRecipe:"Recipe: Shadowfang",name:"Craft: Shadowfang",flavor:"Forge from forest materials.",outputDesc:"Weapon · +28 ATK",
   ingredients:[{label:"Forest Blade (inv or equipped)",has:p=>p.inventory.some(i=>i.name==="Forest Blade")||p.equipment.weapon?.id==="blade"},{label:"Fox Pelt ×3",has:p=>p.inventory.filter(i=>i.name==="Fox Pelt").length>=3}],
   canCraft:p=>(p.inventory.some(i=>i.name==="Forest Blade")||p.equipment.weapon?.id==="blade")&&p.inventory.filter(i=>i.name==="Fox Pelt").length>=3,
   alreadyHave:p=>["shadowfang","shadowfang_plus","shadowfang_plus_alt"].includes(p.equipment.weapon?.id),
   forge:p=>{let inv=[...p.inventory];const bi=inv.findIndex(i=>i.name==="Forest Blade");if(bi!==-1)inv.splice(bi,1);let r=0;inv=inv.filter(i=>{if(i.name==="Fox Pelt"&&r<3){r++;return false;}return true;});return{...p,inventory:inv,equipment:{...p.equipment,weapon:SHOP.weapons[4]}};}},
  {id:"craft_shadow_cloak",requiresRecipe:"Recipe: Shadow Cloak",name:"Craft: Shadow Cloak",flavor:"Stitch plates into shadow.",outputDesc:"Armour · +16 DEF · +65 HP",
   ingredients:[{label:"Iron Plate (inv or equipped)",has:p=>p.inventory.some(i=>i.name==="Iron Plate")||p.equipment.armour?.id==="plate"},{label:"Boar Hide ×2",has:p=>p.inventory.filter(i=>i.name==="Boar Hide").length>=2}],
   canCraft:p=>(p.inventory.some(i=>i.name==="Iron Plate")||p.equipment.armour?.id==="plate")&&p.inventory.filter(i=>i.name==="Boar Hide").length>=2,
   alreadyHave:p=>["shadow","warlords_cloak"].includes(p.equipment.armour?.id),
   forge:p=>{let inv=[...p.inventory];const pi=inv.findIndex(i=>i.name==="Iron Plate");if(pi!==-1)inv.splice(pi,1);let r=0;inv=inv.filter(i=>{if(i.name==="Boar Hide"&&r<2){r++;return false;}return true;});const eq={...p.equipment,armour:SHOP.armour[4]};return{...p,inventory:inv,equipment:eq,hp:Math.min(p.hp,calcStats(getLevel(p.xp,p.maxLevel),eq).maxHp)};}},
  {id:"craft_kings_seal",requiresRecipe:"Recipe: King's Seal",name:"Craft: King's Seal",flavor:"A champion's band reforged.",outputDesc:"Ring · +5 ATK · +4 DEF · +20 HP",
   ingredients:[{label:"Defender's Band (equipped ring)",has:p=>p.equipment.ring?.id==="defender_band"},{label:"Crown of Tusks",has:p=>p.inventory.some(i=>i.name==="Crown of Tusks")}],
   canCraft:p=>p.equipment.ring?.id==="defender_band"&&p.inventory.some(i=>i.name==="Crown of Tusks"),
   alreadyHave:p=>["kings_seal","amethyst_seal"].includes(p.equipment.ring?.id),
   forge:p=>{let inv=[...p.inventory];const x=inv.findIndex(i=>i.name==="Crown of Tusks");if(x!==-1)inv.splice(x,1);const eq={...p.equipment,ring:SHOP.rings[4]};return{...p,inventory:inv,equipment:eq,hp:Math.min(p.hp,calcStats(getLevel(p.xp,p.maxLevel),eq).maxHp)};}},
  {id:"craft_void_shard",requiresRecipe:"Recipe: Void Shard",name:"Craft: Void Shard",flavor:"Moon and silver forged into void.",outputDesc:"Earring · +8 ATK · +3 DEF · +15 HP",
   ingredients:[{label:"Moonstone Drop (equipped earring)",has:p=>p.equipment.earring?.id==="moonstone"},{label:"Silver Earring",has:p=>p.inventory.some(i=>i.name==="Silver Earring")}],
   canCraft:p=>p.equipment.earring?.id==="moonstone"&&p.inventory.some(i=>i.name==="Silver Earring"),
   alreadyHave:p=>["void_shard","void_shard_plus"].includes(p.equipment.earring?.id),
   forge:p=>{let inv=[...p.inventory];const x=inv.findIndex(i=>i.name==="Silver Earring");if(x!==-1)inv.splice(x,1);const eq={...p.equipment,earring:SHOP.earrings[4]};return{...p,inventory:inv,equipment:eq,hp:Math.min(p.hp,calcStats(getLevel(p.xp,p.maxLevel),eq).maxHp)};}},
];

// ── ENEMIES ───────────────────────────────────────────────
const FOREST_ENEMIES={
  rabbit: {id:"rabbit",name:"Wild Rabbit",art:["  (\\(\\   ","  ( •ᴗ•) ","  o(\")(\")"],color:"#a8e6cf",maxHp:18,atk:4,def:0,xp:12,weight:24,loot:[{name:"Rabbit Pelt",weight:50,value:12},{name:"Tiny Bones",weight:20,value:4},{name:"Silver Earring",weight:2,value:45},{name:"nothing",weight:28}]},
  vole:   {id:"vole",  name:"Field Vole",  art:["   ,--,  ","  (·ω·)  ","   mm mm "],color:"#d4b896",maxHp:25,atk:7,def:1,xp:18,weight:24,loot:[{name:"Vole Pelt",weight:50,value:8},{name:"Mini Bones",weight:20,value:3},{name:"Bronze Monocle",weight:2,value:30},{name:"nothing",weight:28}]},
  fox:    {id:"fox",   name:"Forest Fox",  art:["  /^\\/^  "," ( °ᴥ° ) ","  )    ( "],color:"#f97316",maxHp:45,atk:12,def:4,xp:45,weight:24,loot:[{name:"Fox Pelt",weight:50,value:18},{name:"Small Bones",weight:20,value:5},{name:"Copper Ring",weight:2,value:35},{name:"nothing",weight:28}]},
  peasant:{id:"peasant",name:"Rabid Peasant",art:["   \\O/   ","    |    ","   / \\  "],color:"#86efac",maxHp:35,atk:11,def:2,xp:32,weight:24,loot:[{name:"Loincloth",weight:50,value:8},{name:"Warm Ale",weight:20,value:0},{name:"Sack of Coin",weight:2,value:0},{name:"nothing",weight:28}]},
  purplefox:{id:"purplefox",name:"Purple Fox",art:["  /^\\/^  "," ( ×ᴥ× ) ","  )~✦~( "],color:"#c084fc",maxHp:75,atk:20,def:8,xp:90,weight:1,loot:[{name:"Purple Fox Pelt",weight:50,value:55},{name:"Magic Bones",weight:20,value:28},{name:"Amethyst",weight:2,value:75},{name:"nothing",weight:28}]},
  parrot: {id:"parrot",name:"Wild Parrot", art:["   _/\\_  ","  (o o)  "," <=|U|=> "],color:"#4ade80",maxHp:28,atk:9,def:2,xp:25,weight:1,loot:[{name:"Red Feather",weight:20,value:10},{name:"Blue Feather",weight:20,value:10},{name:"Green Feather",weight:20,value:10},{name:"Orange Feather",weight:20,value:10},{name:"Purple Feather",weight:20,value:18}]},
  boar:   {id:"boar",  name:"Charging Boar",art:["  C====3  "," (@oo@)  ","  mm  mm "],color:"#92400e",maxHp:90,atk:25,def:9,xp:110,weight:1,loot:[{name:"Boar Hide",weight:50,value:40},{name:"Boar Bones",weight:20,value:20},{name:"Crown of Tusks",weight:2,value:90},{name:"nothing",weight:28}]},
  noble:  {id:"noble", name:"Fighting Noble",art:["  [≡≡≡]  "," (⌐■_■)  ","  /| |\\  "],color:"#fbbf24",maxHp:70,atk:22,def:11,xp:130,weight:1,loot:[{name:"Sack of Coin",weight:50,value:0},{name:"Large Sack of Coin",weight:20,value:0},{name:"Merchant Seal",weight:2,value:0},{name:"nothing",weight:28}]},
};
const MOUNTAIN_ENEMIES={
  cultist:{id:"cultist",name:"Insane Cultist",art:["  ☽☽☽☽☽  "," (⊙_⊙)   ","  /|Δ|\\  "],color:"#a78bfa",maxHp:140,atk:42,def:16,xp:200,weight:24,loot:[{name:"Large Sack of Coin",weight:50,value:0},{name:"Viridian Ash",weight:20,value:35},{name:"Churchyard Map",weight:2,value:0},{name:"nothing",weight:28}]},
  monk:   {id:"monk",  name:"Vicious Monk",  art:["  _____  "," (>●<)   ","  |===|  "],color:"#f472b6",maxHp:120,atk:48,def:20,xp:220,weight:24,loot:[{name:"Velvet Robe",weight:50,value:45},{name:"Recipe for Shadowfang ★",weight:20,value:0},{name:"Book: Solid Strikes V1",weight:2,value:0,unique:true,uniqueFlag:"solidStrikesDropped"},{name:"nothing",weight:28}]},
  goat:   {id:"goat",  name:"Mountain Goat", art:["  /\\ /\\  "," (^.^)   ","  Y| |Y  "],color:"#d1fae5",maxHp:160,atk:38,def:24,xp:180,weight:24,loot:[{name:"Goat Horns",weight:50,value:28},{name:"Warm Milk",weight:20,value:0},{name:"Treasure Key",weight:2,value:0},{name:"nothing",weight:28}]},
  ogre:   {id:"ogre",  name:"Cruel Ogre",    art:["  ╔═══╗  ","  ║OWO║  ","  ╚═══╝  "],color:"#6b7280",maxHp:200,atk:55,def:14,xp:280,weight:24,loot:[{name:"Ogre Bones",weight:50,value:30},{name:"Ogre Blood",weight:20,value:50},{name:"Talent Chit",weight:2,value:0},{name:"nothing",weight:28}]},
  merchant:{id:"merchant",name:"Travelling Merchant",art:["  [~~~~]  "," (^‿^)   ","  |___|  "],color:"#fbbf24",special:"merchant",weight:1},
  shronk: {id:"shronk",name:"Shronk",         art:["  ~∿~~~  "," (ò_óˇ)  ","  /|▄|\\  "],color:"#4ade80",maxHp:350,atk:50,def:20,xp:450,weight:1,loot:[{name:"Donkey Bones",weight:50,value:22},{name:"Onion",weight:20,value:15},{name:"Swamp Map",weight:2,value:0},{name:"nothing",weight:28}]},
  baal:   {id:"baal",  name:"Baal",           art:["   ψ   ψ  "," (҉_҉)   ","  \\|||/  "],color:"#f87171",maxHp:500,atk:65,def:28,xp:650,weight:1,loot:[{name:"Demon Bones",weight:50,value:60},{name:"Trihorn",weight:20,value:80},{name:"Spiritworld Map",weight:2,value:0},{name:"nothing",weight:28}]},
  priest: {id:"priest",name:"Calm Priest",     art:["   †   †  "," (^ω^)   ","   |   |  "],color:"#bfdbfe",special:"priest",weight:1},
};

// ── LEVEL SYSTEM ──────────────────────────────────────────
const XP_CURVE=[0,0,70,170,320,530,810,1170,1620,2170,2840,3650,4620,5760,7080,8600];
const getLevel =(xp,max=10)=>{for(let i=max;i>=1;i--)if(xp>=XP_CURVE[i])return i;return 1;};
const xpForNext=(lvl,max=10)=>lvl>=max?XP_CURVE[max]:XP_CURVE[lvl+1];
const calcStats=(lvl,eq=DEFAULT_EQUIP)=>{
  const b={maxHp:35+lvl*12,atk:7+lvl*2,def:2+lvl};
  for(const g of Object.values(eq).filter(Boolean)){if(g.atk)b.atk+=g.atk;if(g.def)b.def+=g.def;if(g.hp)b.maxHp+=g.hp;}
  return b;
};

const _spawn=(pool)=>{
  const arr=Object.values(pool).filter(e=>e.maxHp);
  const total=arr.reduce((s,e)=>s+e.weight,0);
  let r=Math.random()*total;
  for(const e of arr){r-=e.weight;if(r<=0)return{...e,hp:e.maxHp};}
  return{...arr[0],hp:arr[0].maxHp};
};
const spawnForest  =()=>_spawn(FOREST_ENEMIES);
const spawnMountain=()=>{
  const arr=Object.values(MOUNTAIN_ENEMIES);
  const total=arr.reduce((s,e)=>s+e.weight,0);
  let r=Math.random()*total;
  for(const e of arr){r-=e.weight;if(r<=0)return e.maxHp?{...e,hp:e.maxHp}:e;}
  return arr[0];
};
const spawnFromZone=(zone)=>{
  const arr=zone.enemies;
  const total=arr.reduce((s,e)=>s+(e.weight||1),0);
  let r=Math.random()*total;
  for(const e of arr){r-=(e.weight||1);if(r<=0)return{...e,hp:e.maxHp};}
  return{...arr[0],hp:arr[0].maxHp};
};

const mkPlayer=(name)=>{
  const s=calcStats(1,DEFAULT_EQUIP);
  return{name,xp:0,gold:10,inventory:[],hp:s.maxHp,equipment:{...DEFAULT_EQUIP},
    critChance:0,holyExpiry:0,holyPermDmg:0,maxLevel:10,
    flatAtk:0,flatDef:0,fleeBonus:0,
    unlockedZones:[],
    learnedTalents:[],
    flags:{solidStrikesDropped:false,expandedMindLearned:false,ironWillLearned:false,battleHymnLearned:false,swiftFeetLearned:false},
  };
};

const groupInventory=(inv)=>Object.values(inv.reduce((acc,item)=>{
  if(!acc[item.name])acc[item.name]={name:item.name,value:item.value,count:0};
  acc[item.name].count++;return acc;
},{}));

// ── MERCHANT POOL ─────────────────────────────────────────
const buildMerchantPool=(player)=>{
  const pool=[];
  const wId=player.equipment.weapon?.id,aId=player.equipment.armour?.id,rId=player.equipment.ring?.id,eId=player.equipment.earring?.id;
  if(!["shadowfang","shadowfang_plus","shadowfang_plus_alt"].includes(wId))pool.push({id:"r_sf",name:"Recipe: Shadowfang",cost:200,type:"recipe",desc:"Forge Shadowfang · Forest Blade + 3 Fox Pelts"});
  if(!["shadow","warlords_cloak"].includes(aId))pool.push({id:"r_sc",name:"Recipe: Shadow Cloak",cost:200,type:"recipe",desc:"Forge Shadow Cloak · Iron Plate + 2 Boar Hides"});
  if(!["kings_seal","amethyst_seal"].includes(rId))pool.push({id:"r_ks",name:"Recipe: King's Seal",cost:180,type:"recipe",desc:"Forge King's Seal · Defender's Band + Crown of Tusks"});
  if(!["void_shard","void_shard_plus"].includes(eId))pool.push({id:"r_vs",name:"Recipe: Void Shard",cost:180,type:"recipe",desc:"Forge Void Shard · Moonstone Drop + Silver Earring"});
  if(!player.inventory.some(i=>i.name==="Treasure Key"))pool.push({id:"tkey",name:"Treasure Key",cost:200,type:"key",desc:"Opens treasure chests"});
  pool.push({id:"ale",name:"Warm Ale",cost:55,type:"usable",desc:"Heals 15–25 HP · Free action"});
  pool.push({id:"milk",name:"Warm Milk",cost:90,type:"usable",desc:"Heals 30–45 HP · Free action"});
  if(!player.flags.solidStrikesDropped)pool.push({id:"b_ss",name:"Book: Solid Strikes V1",cost:500,type:"book",desc:"+1% crit"});
  if(!player.flags.ironWillLearned)pool.push({id:"b_iw",name:"Book: Iron Will",cost:400,type:"book",desc:"+5 DEF permanently"});
  if(!player.flags.battleHymnLearned)pool.push({id:"b_bh",name:"Book: Battle Hymn",cost:400,type:"book",desc:"+5 ATK permanently"});
  if(!player.flags.swiftFeetLearned)pool.push({id:"b_sf",name:"Book: Swift Feet",cost:300,type:"book",desc:"+15% flee rate"});
  const wT=["stick","dagger","sword","blade","shadowfang"].indexOf(wId??"stick");
  const aT=["rags","leather","chain","plate","shadow"].indexOf(aId??"rags");
  const rT=[null,"copper_ring","jade_band","blood_ring","defender_band","kings_seal"].indexOf(rId??null);
  const eT=[null,"bone_hook","silver_drop","hunters","moonstone","void_shard"].indexOf(eId??null);
  if(wT>=0&&wT<4)pool.push({id:"g_sf",name:"Shadowfang",cost:450,type:"gear",item:SHOP.weapons[4],desc:"+28 ATK"});
  if(aT>=0&&aT<4)pool.push({id:"g_sc",name:"Shadow Cloak",cost:550,type:"gear",item:SHOP.armour[4],desc:"+16 DEF · +65 HP"});
  if(rT<4)pool.push({id:"g_ks",name:"King's Seal",cost:500,type:"gear",item:SHOP.rings[4],desc:"+5 ATK · +4 DEF · +20 HP"});
  if(eT<4)pool.push({id:"g_vs",name:"Void Shard",cost:580,type:"gear",item:SHOP.earrings[4],desc:"+8 ATK · +3 DEF · +15 HP"});
  return pool;
};
const genOffer=(player)=>{const pool=buildMerchantPool(player);if(!pool.length)return null;return pool[Math.floor(Math.random()*pool.length)];};

// ── SHARED UI ─────────────────────────────────────────────
const HpBar=({current,max,color=T.green})=>{
  const pct=Math.max(0,Math.min(100,(current/max)*100));
  const bc=pct>50?color:pct>25?T.amber:T.red;
  return<div style={{width:"100%",background:"#0a1a0d",borderRadius:2,height:8}}><div style={{width:`${pct}%`,background:bc,height:"100%",borderRadius:2,transition:"width 0.4s ease"}}/></div>;
};
const XpBar=({xp,level,maxLevel=10})=>{
  if(level>=maxLevel)return<div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"0.85rem"}}>— MAX LEVEL —</div>;
  const pct=((xp-XP_CURVE[level])/(xpForNext(level,maxLevel)-XP_CURVE[level]))*100;
  return<div style={{width:"100%",background:"#0a1a0d",borderRadius:2,height:6}}><div style={{width:`${pct}%`,background:T.gold,height:"100%",borderRadius:2,transition:"width 0.5s ease"}}/></div>;
};
const Panel=({children,style={}})=><div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4,padding:14,...style}}>{children}</div>;
const Btn=({children,onClick,disabled,variant="default",style={}})=>{
  const vs={default:{bg:"#0f2215",color:T.text,border:T.border},primary:{bg:"#0f2e16",color:T.green,border:T.green},danger:{bg:"#2e0f0f",color:T.red,border:T.red},gold:{bg:"#2e1f00",color:T.gold,border:T.gold},purple:{bg:"#1e0f2e",color:T.purple,border:T.purple},amber:{bg:"#2e1a00",color:T.amber,border:T.amber},steel:{bg:"#111827",color:T.steel,border:T.steel},blue:{bg:"#0f1e2e",color:T.blue,border:T.blue},dim:{bg:"#0a150d",color:T.dim,border:T.border}};
  const v=vs[variant]||vs.default;const[hv,setHv]=useState(false);
  return<button onClick={onClick} disabled={disabled} onMouseEnter={()=>setHv(true)} onMouseLeave={()=>setHv(false)} style={{background:hv&&!disabled?v.bg+"ee":v.bg,color:v.color,border:`1px solid ${v.border}`,fontFamily:"'VT323',monospace",fontSize:"1.05rem",padding:"8px 14px",borderRadius:3,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.45:1,transition:"all 0.15s",letterSpacing:"0.04em",transform:hv&&!disabled?"translateY(-1px)":"none",...style}}>{children}</button>;
};
const Tab=({label,active,onClick})=><button onClick={onClick} style={{flex:1,fontFamily:"'VT323',monospace",fontSize:"0.88rem",padding:"7px 4px",borderRadius:"3px 3px 0 0",cursor:"pointer",background:active?T.panel:"#070f09",color:active?T.green:T.dim,border:`1px solid ${active?T.borderBright:T.border}`,borderBottom:active?`1px solid ${T.panel}`:`1px solid ${T.border}`,letterSpacing:"0.05em",transition:"all 0.15s"}}>{label}</button>;
const Divider=({label})=><div style={{display:"flex",alignItems:"center",gap:8,margin:"12px 0"}}><div style={{flex:1,height:1,background:T.border}}/>{label&&<span style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>{label}</span>}<div style={{flex:1,height:1,background:T.border}}/></div>;

const CombatLog=({lines})=>{
  const ref=useRef(null);
  useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight;},[lines]);
  const col=(l)=>{
    if(l.includes("CRIT"))return T.gold;
    if(l.includes("⚔")||l.includes("strike"))return T.amber;
    if(l.includes("💀")||l.includes("unconscious")||l.includes("retaliates")||l.includes("attacks for"))return T.red;
    if(l.includes("✨")||l.includes("XP")||l.includes("📦"))return T.green;
    if(l.includes("🌟")||l.includes("LEVEL UP"))return T.gold;
    if(l.includes("🏃"))return T.blue;
    if(l.includes("🍺")||l.includes("🥛"))return T.amber;
    if(l.includes("✦")||l.includes("misses")||l.includes("holy"))return T.purple;
    return T.text;
  };
  return<div ref={ref} style={{background:"#030a05",border:`1px solid ${T.border}`,borderRadius:3,padding:"10px 12px",height:130,overflowY:"auto",fontFamily:"'VT323',monospace",fontSize:"0.95rem",lineHeight:1.65}}>{lines.map((l,i)=><div key={i} style={{color:col(l)}}>{l}</div>)}</div>;
};

const PlayerPanel=({player,level,stats})=>(
  <Panel style={{marginBottom:12}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
      <span style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"1.15rem"}}>⚔  {player.name}</span>
      <span style={{color:T.gold, fontFamily:"'VT323',monospace",fontSize:"0.9rem" }}>★ Lv{level}  ·  {player.gold}g</span>
    </div>
    <div style={{color:T.text,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:3}}>HP  {player.hp} / {stats.maxHp}</div>
    <HpBar current={player.hp} max={stats.maxHp}/>
    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem",marginTop:8,marginBottom:3}}>
      {level<player.maxLevel?`XP  ${player.xp} / ${xpForNext(level,player.maxLevel)}  →  Lv${level+1}`:"✦ MAX LEVEL ✦"}
    </div>
    <XpBar xp={player.xp} level={level} maxLevel={player.maxLevel}/>
    <div style={{display:"flex",gap:10,marginTop:6,flexWrap:"wrap"}}>
      {hasHeaddress(player)&&<span style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.72rem"}}>✦ Headdress</span>}
      {player.critChance>0&&<span style={{color:T.gold,  fontFamily:"'VT323',monospace",fontSize:"0.72rem"}}>⚡ {Math.round(player.critChance*100)}% Crit</span>}
      {hasHoly(player)&&    <span style={{color:T.blue,  fontFamily:"'VT323',monospace",fontSize:"0.72rem"}}>☩ Holy +{holyDmg(player)}</span>}
      {player.fleeBonus>0&& <span style={{color:T.green, fontFamily:"'VT323',monospace",fontSize:"0.72rem"}}>🏃 +{Math.round(player.fleeBonus*100)}% Flee</span>}
    </div>
  </Panel>
);

// ── SCREEN: LOADING ───────────────────────────────────────
const LoadingScreen=({message})=>(
  <div style={{padding:"60px 20px",textAlign:"center"}}>
    <div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"2rem",marginBottom:16,
      animation:"pulse 1.5s ease-in-out infinite"}}>⚙</div>
    <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"1.2rem",marginBottom:12}}>GENERATING...</div>
    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.9rem",maxWidth:280,margin:"0 auto",lineHeight:1.6}}>{message}</div>
    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.75rem",marginTop:20}}>The AI weaves your world...</div>
  </div>
);

// ── SCREEN: ZONE UNLOCKED ─────────────────────────────────
const ZoneUnlockedScreen=({zone,onEnter,onLater})=>(
  <div style={{padding:20}}>
    <div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"1.4rem",textAlign:"center",marginBottom:4}}>✦ ZONE UNLOCKED ✦</div>
    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",textAlign:"center",marginBottom:20,letterSpacing:"0.1em"}}>{zone.zoneName.toUpperCase()}</div>
    <Panel style={{marginBottom:14,textAlign:"center"}}>
      <div style={{color:T.text,fontFamily:"'VT323',monospace",fontSize:"0.95rem",lineHeight:1.7,marginBottom:12}}>{zone.description}</div>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.82rem",marginBottom:12}}>{zone.campDescription}</div>
      <Divider label="ENEMIES"/>
      <div style={{display:"flex",flexWrap:"wrap",gap:"6px 14px",justifyContent:"center"}}>
        {zone.enemies.map(e=><span key={e.id} style={{color:e.color||T.text,fontFamily:"'VT323',monospace",fontSize:"0.82rem"}}>{e.name}</span>)}
      </div>
    </Panel>
    <div style={{display:"flex",gap:8}}>
      <Btn onClick={onEnter} variant="primary" style={{flex:1,padding:12,fontSize:"1rem"}}>⚔ Enter Now</Btn>
      <Btn onClick={onLater} style={{flex:1,padding:12,fontSize:"1rem"}}>← Later</Btn>
    </div>
  </div>
);

// ── SCREEN: TALENT SELECTION ──────────────────────────────
const TalentSelectionScreen=({talents,onPick,onCancel})=>(
  <div style={{padding:16}}>
    <div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"1.3rem",marginBottom:4}}>⚡ CHOOSE A TALENT</div>
    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:16}}>A permanent ability. Choose wisely.</div>
    {talents.map((t,i)=>(
      <Panel key={t.id||i} style={{marginBottom:10,cursor:"pointer",border:`1px solid ${T.amber}`}} onClick={()=>onPick(t)}>
        <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"1.1rem",marginBottom:4}}>{t.name}</div>
        <div style={{color:T.text, fontFamily:"'VT323',monospace",fontSize:"0.88rem"}}>{t.description}</div>
      </Panel>
    ))}
    <Btn onClick={onCancel} style={{width:"100%",marginTop:4}}>← Cancel (Chit returned)</Btn>
  </div>
);

// ── SCREEN: TITLE ─────────────────────────────────────────
const SAVE_KEY = "byzantium_save";
const saveGame  = (player, screen, huntZone, currentAiZone) => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ player, screen: screen === "combat" ? "town" : screen, huntZone, currentAiZone, savedAt: Date.now() }));
  } catch(e) { console.warn("Save failed", e); }
};
const loadGame = () => {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
};
const deleteSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch {} };

const TitleScreen=({onStart, onContinue, saveData})=>(
  <div style={{textAlign:"center",padding:"28px 20px 24px"}}>
    <div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"clamp(2.2rem,11vw,3rem)",letterSpacing:"0.12em",lineHeight:1,marginBottom:2,textShadow:"0 0 30px rgba(212,168,67,0.45)"}}>BYZANTIUM</div>
    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",letterSpacing:"0.22em",marginBottom:20}}>── TALES OF THE FOREST ──</div>
    <pre style={{color:T.greenDim,fontFamily:"monospace",fontSize:"0.95rem",lineHeight:1.5,marginBottom:24,display:"inline-block",textAlign:"left"}}>{`🌲 🌲  🌲 🌲 🌲 🌲\n 🌿   🌿  🌿  🌿\n🌲 🌿 🌿 🌿 🌿 🌲\n🌲🌲🌲🌲🌲🌲🌲🌲`}</pre>
    {saveData&&(
      <div style={{marginBottom:10}}>
        <Btn onClick={onContinue} variant="primary" style={{fontSize:"1.3rem",padding:"12px 40px",width:"100%"}}>▶  CONTINUE</Btn>
        <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem",marginTop:6}}>
          {saveData.player.name}  ·  Lv{getLevel(saveData.player.xp,saveData.player.maxLevel||10)}  ·  {saveData.player.gold}g  ·  {new Date(saveData.savedAt).toLocaleDateString()}
        </div>
      </div>
    )}
    <div style={{marginBottom:14}}><Btn onClick={onStart} variant={saveData?"default":"primary"} style={{fontSize:saveData?"1rem":"1.3rem",padding:saveData?"10px 40px":"12px 40px",width:"100%"}}>▶  {saveData?"NEW GAME":"BEGIN ADVENTURE"}</Btn></div>
    <div style={{background:"#070f09",border:`1px solid ${T.border}`,borderRadius:4,padding:"10px 14px",textAlign:"left",marginBottom:8}}>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.75rem",marginBottom:6,letterSpacing:"0.1em"}}>ZONE I · THE FOREST</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"4px 12px"}}>{Object.values(FOREST_ENEMIES).map(e=><span key={e.id} style={{color:e.color,fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>{e.name}</span>)}</div>
    </div>
    <div style={{background:"#070f09",border:"1px solid #1a2a3a",borderRadius:4,padding:"10px 14px",textAlign:"left",marginBottom:8}}>
      <div style={{color:"#2a4a6a",fontFamily:"'VT323',monospace",fontSize:"0.75rem",marginBottom:4,letterSpacing:"0.1em"}}>ZONE II · THE MOUNTAIN  [Lv10]</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"4px 12px"}}>{Object.values(MOUNTAIN_ENEMIES).map(e=><span key={e.id} style={{color:"#1a3050",fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>{e.name}</span>)}</div>
    </div>
    <div style={{background:"#070f09",border:"1px solid #1a1a2a",borderRadius:4,padding:"10px 14px",textAlign:"left"}}>
      <div style={{color:"#2a2a5a",fontFamily:"'VT323',monospace",fontSize:"0.75rem",marginBottom:4,letterSpacing:"0.1em"}}>ZONES III–V · AI GENERATED  [Map required]</div>
      <div style={{color:"#1a1a3a",fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>The Churchyard · The Swamp · The Spiritworld</div>
    </div>
    <div style={{color:"#1a3320",fontFamily:"'VT323',monospace",fontSize:"0.72rem",marginTop:14}}>v3.0 · Hunt · Loot · Conquer · AI-Generated Worlds</div>
  </div>
);

// ── SCREEN: NAME ──────────────────────────────────────────
const NameScreen=({onConfirm})=>{
  const[name,setName]=useState("");const clean=name.trim();const ss=calcStats(1,DEFAULT_EQUIP);
  return(
    <div style={{padding:"24px 20px"}}>
      <div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"1.4rem",textAlign:"center",marginBottom:2}}>WHO ARE YOU, TRAVELLER?</div>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.88rem",textAlign:"center",marginBottom:20}}>The empire remembers all who enter...</div>
      <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&clean&&onConfirm(clean)} placeholder="Enter your name..." maxLength={18} autoFocus
        style={{background:T.panel,border:`1px solid ${clean?T.green:T.border}`,color:T.green,fontFamily:"'VT323',monospace",fontSize:"1.3rem",padding:"10px 16px",borderRadius:3,width:"100%",outline:"none",textAlign:"center",transition:"border-color 0.2s",boxSizing:"border-box",marginBottom:16}}/>
      <Panel style={{marginBottom:16}}>
        <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.82rem",marginBottom:10,textAlign:"center"}}>── STARTING CHARACTER ──</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          {[["❤ HP",ss.maxHp],["⚔ ATK",ss.atk],["🛡 DEF",ss.def]].map(([l,v])=>(
            <div key={l} style={{background:"#060e08",border:`1px solid ${T.border}`,borderRadius:3,padding:"8px 4px",textAlign:"center"}}>
              <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.72rem"}}>{l}</div>
              <div style={{color:T.white,fontFamily:"'VT323',monospace",fontSize:"1.2rem"}}>{v}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Btn onClick={()=>clean&&onConfirm(clean)} variant="primary" disabled={!clean} style={{fontSize:"1.15rem",padding:"11px 28px",width:"100%"}}>ENTER THE WORLD →</Btn>
    </div>
  );
};

// ── SCREEN: TOWN ──────────────────────────────────────────
const TownScreen=({player,level,stats,onForest,onShop,onStats,onRest,onMountain,onEnterZone})=>{
  const atMax=player.hp>=stats.maxHp;const mapOwned=hasMap(player);
  return(
    <div style={{padding:16}}>
      <div style={{fontFamily:"'VT323',monospace",color:T.gold,fontSize:"1.3rem"}}>⌂  SYLVANTIDE VILLAGE</div>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:14}}>A quiet hamlet on the empire's edge</div>
      <PlayerPanel player={player} level={level} stats={stats}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <Btn onClick={onForest} variant="primary" style={{padding:12,fontSize:"1rem"}}>🌲 Enter Forest</Btn>
        <Btn onClick={onShop}   variant="gold"    style={{padding:12,fontSize:"1rem"}}>🏪 Merchant</Btn>
        <Btn onClick={onStats}                    style={{padding:12,fontSize:"1rem"}}>📜 Stats</Btn>
        <Btn onClick={onRest} disabled={atMax} variant={atMax?"dim":"default"} style={{padding:12,fontSize:"1rem"}}>🛏 Rest {atMax?"(Full)":"(Free)"}</Btn>
        <Btn onClick={mapOwned?onMountain:null} disabled={!mapOwned} variant={mapOwned?"steel":"dim"} style={{padding:12,fontSize:"1rem",gridColumn:"1 / -1"}}>
          ⛰ {mapOwned?"Enter The Mountain":"Mountain  (Map required)"}
        </Btn>
      </div>
      {player.unlockedZones.length>0&&(
        <>
          <Divider label="AI ZONES"/>
          {player.unlockedZones.map(z=>(
            <Btn key={z.id} onClick={()=>onEnterZone(z)} variant="purple" style={{width:"100%",marginBottom:6,padding:10,fontSize:"1rem"}}>
              ✦ Enter {z.zoneName}
            </Btn>
          ))}
        </>
      )}
      {player.inventory.length>0&&(
        <div style={{marginTop:8,padding:"8px 12px",background:"#1f1500",border:`1px solid ${T.gold}`,borderRadius:3,color:T.gold,fontFamily:"'VT323',monospace",fontSize:"0.9rem",textAlign:"center"}}>
          ⚠  {player.inventory.length} item{player.inventory.length!==1?"s":""} in your bag
        </div>
      )}
    </div>
  );
};

// ── SCREEN: MOUNTAIN CAMP ─────────────────────────────────
const MountainCampScreen=({player,level,stats,onHunt,onBlacksmith,onStats,onRest,onReturn})=>{
  const atMax=player.hp>=stats.maxHp;
  return(
    <div style={{padding:16}}>
      <div style={{fontFamily:"'VT323',monospace",color:T.steel,fontSize:"1.3rem"}}>⛰  IRON PEAK CAMP</div>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:14}}>The air is thin. The stone runs cold.</div>
      <PlayerPanel player={player} level={level} stats={stats}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Btn onClick={onHunt}       variant="primary" style={{padding:12,fontSize:"1rem"}}>⚔ Hunt Mountain</Btn>
        <Btn onClick={onBlacksmith} variant="steel"   style={{padding:12,fontSize:"1rem"}}>🔨 Blacksmith</Btn>
        <Btn onClick={onStats}                        style={{padding:12,fontSize:"1rem"}}>📜 Stats</Btn>
        <Btn onClick={onRest} disabled={atMax} variant={atMax?"dim":"default"} style={{padding:12,fontSize:"1rem"}}>🛏 Rest {atMax?"(Full)":"(Free)"}</Btn>
        <Btn onClick={onReturn} style={{padding:12,fontSize:"1rem",gridColumn:"1 / -1"}}>← Return to Sylvantide</Btn>
      </div>
    </div>
  );
};

// ── SCREEN: AI ZONE CAMP ──────────────────────────────────
const AiZoneCampScreen=({zone,player,level,stats,onHunt,onStats,onRest,onReturn})=>{
  const atMax=player.hp>=stats.maxHp;
  return(
    <div style={{padding:16}}>
      <div style={{fontFamily:"'VT323',monospace",color:T.purple,fontSize:"1.3rem"}}>✦  {zone.zoneName.toUpperCase()}</div>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:14}}>{zone.campDescription}</div>
      <PlayerPanel player={player} level={level} stats={stats}/>
      <Panel style={{marginBottom:12,textAlign:"center",padding:"8px 14px"}}>
        <div style={{color:T.text,fontFamily:"'VT323',monospace",fontSize:"0.88rem",lineHeight:1.6}}>{zone.description}</div>
      </Panel>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Btn onClick={onHunt}  variant="primary" style={{padding:12,fontSize:"1rem"}}>⚔ Hunt Zone</Btn>
        <Btn onClick={onStats}                   style={{padding:12,fontSize:"1rem"}}>📜 Stats</Btn>
        <Btn onClick={onRest} disabled={atMax} variant={atMax?"dim":"default"} style={{padding:12,fontSize:"1rem"}}>🛏 Rest {atMax?"(Full)":"(Free)"}</Btn>
        <Btn onClick={onReturn} style={{padding:12,fontSize:"1rem"}}>← Return to Village</Btn>
      </div>
    </div>
  );
};

// ── SCREEN: COMBAT ────────────────────────────────────────
const CombatScreen=({player,stats,enemy,log,phase,onAttack,onFlee,onReturn,onHuntAgain,onUseItem})=>{
  const[showItems,setShowItems]=useState(false);
  const ales=player.inventory.filter(i=>i.name==="Warm Ale");
  const milks=player.inventory.filter(i=>i.name==="Warm Milk");
  const totalHeal=ales.length+milks.length;
  return(
    <div style={{padding:16}}>
      <div style={{color:T.red,fontFamily:"'VT323',monospace",fontSize:"1.2rem",marginBottom:10}}>⚔  COMBAT — {enemy.name.toUpperCase()}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <Panel style={{padding:10}}>
          <div style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{player.name}</div>
          <div style={{color:T.dim,  fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>HP {player.hp}/{stats.maxHp}</div>
          <HpBar current={player.hp} max={stats.maxHp}/>
          <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
            {hasHeaddress(player)&&<span style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.65rem"}}>✦</span>}
            {player.critChance>0&&<span style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"0.65rem"}}>⚡</span>}
            {hasHoly(player)&&<span style={{color:T.blue,fontFamily:"'VT323',monospace",fontSize:"0.65rem"}}>☩</span>}
          </div>
        </Panel>
        <Panel style={{padding:10}}>
          <div style={{color:enemy.color||T.text,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{enemy.name}</div>
          <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>HP {enemy.hp}/{enemy.maxHp}</div>
          <HpBar current={enemy.hp} max={enemy.maxHp} color={T.red}/>
        </Panel>
      </div>
      <Panel style={{textAlign:"center",marginBottom:10,padding:"12px 10px"}}>
        <pre style={{color:enemy.hp>0?(enemy.color||T.text):T.dim,fontFamily:"monospace",fontSize:"1.15rem",lineHeight:1.5,margin:0,opacity:enemy.hp<=0?0.3:1,transition:"opacity 0.4s"}}>{(enemy.art||["  ???  ","  ???  ","  ???  "]).join("\n")}</pre>
        {enemy.hp<=0&&<div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginTop:4}}>✝  DEFEATED</div>}
      </Panel>
      <CombatLog lines={log}/>
      {showItems&&phase==="player_turn"&&(
        <Panel style={{marginTop:8,padding:10}}>
          <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:8}}>USE ITEM  <span style={{color:T.dim,fontSize:"0.72rem"}}>(free action)</span></div>
          {totalHeal===0?<div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem"}}>No usable items.</div>:(
            <>
              {ales.length>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div><div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.9rem"}}>🍺 Warm Ale <span style={{color:T.dim}}>×{ales.length}</span></div><div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.72rem"}}>Heals 15–25 HP</div></div>
                <Btn onClick={()=>{onUseItem("Warm Ale");setShowItems(false);}} variant="amber" style={{padding:"4px 10px",fontSize:"0.85rem"}}>Drink</Btn>
              </div>}
              {milks.length>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{color:T.blue,fontFamily:"'VT323',monospace",fontSize:"0.9rem"}}>🥛 Warm Milk <span style={{color:T.dim}}>×{milks.length}</span></div><div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.72rem"}}>Heals 30–45 HP</div></div>
                <Btn onClick={()=>{onUseItem("Warm Milk");setShowItems(false);}} variant="blue" style={{padding:"4px 10px",fontSize:"0.85rem"}}>Drink</Btn>
              </div>}
            </>
          )}
          <Btn onClick={()=>setShowItems(false)} style={{marginTop:8,width:"100%",fontSize:"0.85rem"}}>Cancel</Btn>
        </Panel>
      )}
      <div style={{display:"flex",gap:8,marginTop:10}}>
        {phase==="player_turn"&&<>
          <Btn onClick={onAttack} variant="primary" style={{flex:1}}>⚔ Attack</Btn>
          <Btn onClick={()=>setShowItems(s=>!s)} variant="amber" disabled={totalHeal===0} style={{flex:1}}>🍺 {totalHeal>0?`Item (${totalHeal})`:"No Items"}</Btn>
          <Btn onClick={onFlee}   variant="danger"  style={{flex:1}}>🏃 Flee</Btn>
        </>}
        {phase==="victory"&&<>
          <Btn onClick={onHuntAgain} variant="primary" style={{flex:1}}>⚔ Hunt Again</Btn>
          <Btn onClick={onReturn}    variant="gold"    style={{flex:1}}>⌂ Village</Btn>
        </>}
        {(phase==="defeat"||phase==="fled")&&<Btn onClick={onReturn} variant="gold" style={{flex:1,fontSize:"1.05rem"}}>{phase==="defeat"?"💀 Retreat to Village":"⌂ Return to Village"}</Btn>}
      </div>
    </div>
  );
};

// ── SCREEN: MERCHANT ENCOUNTER ────────────────────────────
const MerchantEncounterScreen=({player,stats,offer,onBuy,onLeave})=>(
  <div style={{padding:16}}>
    <div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"1.2rem",marginBottom:6}}>🏕 TRAVELLING MERCHANT</div>
    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:16}}>"One item, one price. Take it or leave it."</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
      <Panel style={{padding:10}}><div style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{player.name}</div><div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>HP {player.hp}/{stats.maxHp}</div><HpBar current={player.hp} max={stats.maxHp}/></Panel>
      <Panel style={{padding:10,textAlign:"center"}}><pre style={{color:T.gold,fontFamily:"monospace",fontSize:"1.1rem",lineHeight:1.5,margin:0}}>{`  [~~~~]\n (^‿^)\n  |___|`}</pre></Panel>
    </div>
    {offer?(
      <Panel style={{marginBottom:14,border:`1px solid ${T.gold}`}}>
        <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.8rem",marginBottom:8}}>TODAY'S OFFER</div>
        <div style={{color:T.white,fontFamily:"'VT323',monospace",fontSize:"1.1rem"}}>{offer.name}</div>
        <div style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.82rem",marginBottom:8}}>{offer.desc}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{color:player.gold>=offer.cost?T.gold:T.red,fontFamily:"'VT323',monospace",fontSize:"1.1rem"}}>{offer.cost}g</span><span style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>You have: {player.gold}g</span></div>
        <Btn onClick={()=>player.gold>=offer.cost&&onBuy(offer)} disabled={player.gold<offer.cost} variant="gold" style={{width:"100%",marginTop:10,fontSize:"1.05rem",padding:10}}>{player.gold>=offer.cost?"Buy":"Not enough gold"}</Btn>
      </Panel>
    ):(
      <Panel style={{marginBottom:14,textAlign:"center",padding:"20px 14px"}}><div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.9rem"}}>"I'm fresh out of things you'd want."</div></Panel>
    )}
    <Btn onClick={onLeave} style={{width:"100%"}}>← Continue Journey</Btn>
  </div>
);

// ── SCREEN: PRIEST ────────────────────────────────────────
const PriestEncounterScreen=({player,stats,onDonate,onLeave})=>{
  const canAfford=player.gold>=500;const hasBook=player.flags.expandedMindLearned;
  return(
    <div style={{padding:16}}>
      <div style={{color:T.blue,fontFamily:"'VT323',monospace",fontSize:"1.2rem",marginBottom:6}}>☩ CALM PRIEST</div>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:16}}>He sits peacefully by a small stone altar.</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <Panel style={{padding:10}}><div style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{player.name}</div><div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>HP {player.hp}/{stats.maxHp}</div><HpBar current={player.hp} max={stats.maxHp}/></Panel>
        <Panel style={{padding:10,textAlign:"center"}}><pre style={{color:T.blue,fontFamily:"monospace",fontSize:"1.1rem",lineHeight:1.5,margin:0}}>{`  †   †\n (^ω^)\n  |   |`}</pre></Panel>
      </div>
      <Panel style={{marginBottom:14}}>
        <div style={{color:T.text,fontFamily:"'VT323',monospace",fontSize:"0.9rem",marginBottom:10,lineHeight:1.6}}>
          {!hasBook?`"A donation of 500 gold brings the light of wisdom — and may yet raise your limits."`:`"Bless you, child. A further donation grants holy fury for five minutes."`}
        </div>
        <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem",marginBottom:10}}>{!hasBook?"Reward: Book: Expansive Mind (level cap 10 → 15)":"Reward: +10 holy damage per swing for 5 minutes"}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{color:canAfford?T.gold:T.red,fontFamily:"'VT323',monospace",fontSize:"1.1rem"}}>500g</span>
          <span style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>You have: {player.gold}g</span>
        </div>
        <Btn onClick={canAfford?onDonate:null} disabled={!canAfford} variant="blue" style={{width:"100%",fontSize:"1.05rem",padding:10}}>{canAfford?"Make Donation":"Not enough gold"}</Btn>
      </Panel>
      <Btn onClick={onLeave} style={{width:"100%"}}>← Continue Journey</Btn>
    </div>
  );
};

// ── SCREEN: SHOP ──────────────────────────────────────────
const SLOT_LABELS={weapon:"⚔ Weapon",armour:"🛡 Armour",ring:"💍 Ring",earring:"💎 Earring"};
const SLOT_ICONS ={weapon:"⚔",armour:"🛡",ring:"💍",earring:"💎"};

const ShopScreen=({player,level,onSell,onSellAll,onBuy,onOpenSack,onReadBook,onBuyMap,onUseMap,onUseTalentChit,onBack})=>{
  const[tab,setTab]=useState("sell");const[buyTab,setBuyTab]=useState("weapons");
  const lootItems=groupInventory(player.inventory.filter(i=>isSellable(i.name)));
  const specialItems=groupInventory(player.inventory.filter(i=>!isSellable(i.name)));
  const lootTotal=lootItems.reduce((s,i)=>s+sellValue(player,i.value)*i.count,0);
  const sealActive=hasSeal(player);const mapOwned=hasMap(player);
  const isEquipped=item=>player.equipment[item.slot]?.id===item.id;
  const canAfford =item=>player.gold>=item.cost;
  return(
    <div style={{padding:16}}>
      <div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"1.3rem"}}>🏪 TRADER MIRO'S POST</div>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:12}}>"Arms, armour, trinkets — I have it all."</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{color:T.text,fontFamily:"'VT323',monospace",fontSize:"0.9rem"}}>Your Gold {sealActive&&<span style={{color:T.gold}}>· 🔖 +10%</span>}</span>
        <span style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"1.15rem"}}>{player.gold}g</span>
      </div>
      <div style={{display:"flex",gap:0,marginBottom:-1}}>
        <Tab label="SELL"  active={tab==="sell"}  onClick={()=>setTab("sell")} />
        <Tab label="BUY"   active={tab==="buy"}   onClick={()=>setTab("buy")}  />
        <Tab label="ITEMS" active={tab==="items"} onClick={()=>setTab("items")}/>
      </div>
      <Panel style={{borderRadius:"0 0 4px 4px",padding:12}}>
        {tab==="sell"&&(lootItems.length===0?
          <div style={{color:T.dim,fontFamily:"'VT323',monospace",textAlign:"center",padding:"20px 0"}}>Nothing to sell — hunt some creatures!</div>:(
          <>
            {lootItems.map(item=>{const sv=sellValue(player,item.value);return(
              <div key={item.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                <div><div style={{color:T.text,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{item.name} <span style={{color:T.dim}}>×{item.count}</span></div><div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>{sv}g each</div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{color:T.gold,fontFamily:"'VT323',monospace"}}>{sv*item.count}g</span><Btn onClick={()=>onSell(item.name)} variant="gold" style={{padding:"4px 10px",fontSize:"0.85rem"}}>Sell</Btn></div>
              </div>
            );})}
            <div style={{marginTop:12}}><Btn onClick={onSellAll} variant="gold" style={{width:"100%",fontSize:"1.05rem",padding:10}}>✦  Sell All  ({lootTotal}g)</Btn></div>
          </>
        ))}
        {tab==="buy"&&(
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:4,marginBottom:12}}>
              {Object.keys(SHOP).map(cat=><button key={cat} onClick={()=>setBuyTab(cat)} style={{background:buyTab===cat?"#1a3d20":"#0a150d",color:buyTab===cat?T.green:T.dim,border:`1px solid ${buyTab===cat?T.green:T.border}`,fontFamily:"'VT323',monospace",fontSize:"0.8rem",padding:"5px 2px",borderRadius:3,cursor:"pointer",textTransform:"capitalize"}}>{SLOT_ICONS[cat.replace(/s$/,"")]}  {cat.charAt(0).toUpperCase()+cat.slice(1)}</button>)}
            </div>
            {(()=>{const slot=buyTab.replace(/s$/,"");const eq=player.equipment[slot];return eq?(<div style={{marginBottom:10,padding:"6px 10px",background:"#0a1f0d",border:`1px solid ${T.greenDim}`,borderRadius:3}}><span style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>Equipped: </span><span style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"0.9rem"}}>{eq.name}  <span style={{color:T.dim}}>{statLabel(eq)}</span></span></div>):<div style={{marginBottom:10,color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>No {slot} equipped</div>;})()}
            {SHOP[buyTab].map(item=>{const eq=isEquipped(item);const af=canAfford(item);return(
              <div key={item.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.border}`,opacity:!af&&!eq?0.5:1}}>
                <div><div style={{color:eq?T.green:T.text,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{eq&&"✓ "}{item.name}</div><div style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>{statLabel(item)}</div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {item.cost>0&&<span style={{color:af?T.gold:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.9rem"}}>{item.cost}g</span>}
                  <Btn onClick={()=>!eq&&onBuy(item)} disabled={eq||(!af&&item.cost>0)} variant={eq?"dim":"gold"} style={{padding:"4px 8px",fontSize:"0.82rem"}}>{eq?"Worn":item.cost===0?"Free":"Buy"}</Btn>
                </div>
              </div>
            );})}
          </>
        )}
        {tab==="items"&&(
          <>
            {specialItems.map(item=>{
              const sp=SPECIAL[item.name];const type=sp?.type;
              const iconMap={key:"🔖",book:"📖",recipe:"📜",usable:"🍺",openable:"💰",map:"🗺",talent:"⚡"};
              const colorMap={key:T.gold,book:T.blue,recipe:T.purple,usable:T.amber,openable:T.blue,map:T.steel,talent:T.gold};
              return(
                <div key={item.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
                  <div>
                    <div style={{color:colorMap[type]||T.text,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{iconMap[type]||"·"} {item.name}{item.count>1&&<span style={{color:T.dim}}> ×{item.count}</span>}</div>
                    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.75rem"}}>
                      {type==="key"&&sp?.desc}{type==="book"&&sp?.desc}{type==="recipe"&&sp?.desc}
                      {type==="usable"&&`Heals ${sp?.healMin}–${sp?.healMax} HP · Free action`}
                      {type==="openable"&&`Contains ${sp?.goldMin}–${sp?.goldMax}g`}
                      {type==="map"&&sp?.desc}{type==="talent"&&sp?.desc}
                    </div>
                  </div>
                  <div>
                    {type==="openable"&&<Btn onClick={()=>onOpenSack(item.name)} variant="gold" style={{padding:"4px 10px",fontSize:"0.85rem"}}>Open</Btn>}
                    {type==="book"&&<Btn onClick={()=>onReadBook(item.name)} variant="blue" style={{padding:"4px 10px",fontSize:"0.85rem"}}>Read</Btn>}
                    {type==="key"&&<span style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>ACTIVE</span>}
                    {type==="usable"&&<span style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.75rem"}}>Combat only</span>}
                    {type==="recipe"&&<span style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.75rem"}}>Blacksmith</span>}
                    {type==="map"&&<Btn onClick={()=>onUseMap&&onUseMap(item.name)} variant="purple" style={{padding:"4px 10px",fontSize:"0.85rem"}}>{(player.zoneCount||0)>=20?"⚠ Final Boss!":"Use Map"}</Btn>}
                    {type==="talent"&&<Btn onClick={()=>onUseTalentChit&&onUseTalentChit()} variant="amber" style={{padding:"4px 10px",fontSize:"0.85rem"}}>Use Chit</Btn>}
                  </div>
                </div>
              );
            })}
            {specialItems.length===0&&level<10&&<div style={{color:T.dim,fontFamily:"'VT323',monospace",textAlign:"center",padding:"20px 0"}}>No special items in your bag.</div>}
            {level>=10&&!mapOwned&&(
              <>
                <Divider label="RARE MAPS"/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0"}}>
                  <div><div style={{color:T.steel,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>🗺  Mountain Map</div><div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.75rem"}}>Unlocks The Mountain zone</div></div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{color:player.gold>=1000?T.gold:T.dim,fontFamily:"'VT323',monospace"}}>1000g</span>
                    <Btn onClick={onBuyMap} disabled={player.gold<1000} variant="steel" style={{padding:"4px 10px",fontSize:"0.85rem"}}>{player.gold>=1000?"Buy":"Need 1000g"}</Btn>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </Panel>
      <div style={{marginTop:12}}><Btn onClick={onBack} style={{width:"100%"}}>← Back to Village</Btn></div>
    </div>
  );
};

// ── SCREEN: BLACKSMITH ────────────────────────────────────
const BlacksmithScreen=({player,onForge,onBack})=>{
  const visible=RECIPES.filter(r=>!r.requiresRecipe||player.inventory.some(i=>i.name===r.requiresRecipe));
  return(
    <div style={{padding:16}}>
      <div style={{color:T.steel,fontFamily:"'VT323',monospace",fontSize:"1.3rem"}}>🔨 ALDRIC'S FORGE</div>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:16}}>"Bring me the materials. I'll do the rest."</div>
      {visible.map(recipe=>{const already=recipe.alreadyHave(player);const can=!already&&recipe.canCraft(player);return(
        <Panel key={recipe.id} style={{marginBottom:10,border:`1px solid ${already?T.greenDim:can?T.amber:T.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
            <div><div style={{color:already?T.green:can?T.amber:T.text,fontFamily:"'VT323',monospace",fontSize:"1.05rem"}}>{already?"✓ ":""}{recipe.name}</div><div style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>{recipe.outputDesc}</div></div>
            {already?<span style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>FORGED</span>:<Btn onClick={()=>can&&onForge(recipe.id)} disabled={!can} variant={can?"amber":"dim"} style={{padding:"4px 10px",fontSize:"0.85rem"}}>Forge</Btn>}
          </div>
          <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.75rem",marginBottom:8,fontStyle:"italic"}}>{recipe.flavor}</div>
          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:8}}>
            {recipe.ingredients.map(ing=>{const have=ing.has(player);return<div key={ing.label} style={{color:have?T.green:T.red,fontFamily:"'VT323',monospace",fontSize:"0.82rem",marginBottom:2}}>{have?"✓":"✗"}  {ing.label}</div>;})}
          </div>
        </Panel>
      );})}
      {visible.length===0&&<div style={{color:T.dim,fontFamily:"'VT323',monospace",textAlign:"center",padding:"20px 0"}}>No recipes available yet.</div>}
      <div style={{marginTop:4}}><Btn onClick={onBack} style={{width:"100%"}}>← Back to Camp</Btn></div>
    </div>
  );
};

// ── SCREEN: STATS ─────────────────────────────────────────
const StatsScreen=({player,level,stats,onBack})=>{
  const lootItems=groupInventory(player.inventory.filter(i=>isSellable(i.name)));
  return(
    <div style={{padding:16}}>
      <div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"1.3rem",marginBottom:14}}>📜 ADVENTURER'S RECORD</div>
      <Panel style={{marginBottom:12}}>
        <div style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"1.3rem"}}>{player.name}</div>
        <div style={{color:T.gold, fontFamily:"'VT323',monospace",fontSize:"0.95rem",marginBottom:12}}>★  Level {level} Adventurer</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 20px"}}>
          {[["❤  HP",`${player.hp} / ${stats.maxHp}`],["⚔  ATK",stats.atk],["🛡  DEF",stats.def],["💰 Gold",`${player.gold}g`],["✨ XP",player.xp],["🎯 Next Lv",level<player.maxLevel?xpForNext(level,player.maxLevel):"MAX"]].map(([l,v])=>(
            <div key={l}><div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.75rem"}}>{l}</div><div style={{color:T.white,fontFamily:"'VT323',monospace",fontSize:"1.05rem"}}>{v}</div></div>
          ))}
        </div>
        <div style={{display:"flex",gap:10,marginTop:8,flexWrap:"wrap"}}>
          {hasHeaddress(player)&&<span style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>✦ Headdress</span>}
          {player.critChance>0&&<span style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>⚡ {Math.round(player.critChance*100)}% crit</span>}
          {hasHoly(player)&&<span style={{color:T.blue,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>☩ +{holyDmg(player)} holy</span>}
          {player.fleeBonus>0&&<span style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>🏃 +{Math.round(player.fleeBonus*100)}% flee</span>}
        </div>
        {player.learnedTalents?.length>0&&(
          <>
            <Divider label="TALENTS"/>
            {player.learnedTalents.map(t=><div key={t.id} style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.82rem",marginBottom:2}}>⚡ {t.name} — {t.description}</div>)}
          </>
        )}
        <Divider/>
        <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem",marginBottom:4}}>
          {level<player.maxLevel?`Progress to Lv${level+1}:  ${player.xp-XP_CURVE[level]} / ${xpForNext(level,player.maxLevel)-XP_CURVE[level]} XP`:"Maximum level achieved."}
        </div>
        <XpBar xp={player.xp} level={level} maxLevel={player.maxLevel}/>
      </Panel>
      <Panel style={{marginBottom:12}}>
        <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.95rem",marginBottom:8}}>EQUIPMENT</div>
        {Object.entries(SLOT_LABELS).map(([slot,label])=>{const item=player.equipment[slot];return(
          <div key={slot} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${T.border}`,fontFamily:"'VT323',monospace"}}>
            <span style={{color:T.dim,fontSize:"0.85rem"}}>{label}</span>
            <div style={{textAlign:"right"}}><span style={{color:item?T.text:T.dim,fontSize:"0.85rem"}}>{item?item.name:"—"}</span>{item&&statLabel(item)!=="—"&&<div style={{color:T.purple,fontSize:"0.75rem"}}>{statLabel(item)}</div>}</div>
          </div>
        );})}
      </Panel>
      {lootItems.length>0&&(
        <Panel style={{marginBottom:12}}>
          <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.95rem",marginBottom:8}}>LOOT BAG</div>
          {lootItems.map(item=><div key={item.name} style={{display:"flex",justifyContent:"space-between",fontFamily:"'VT323',monospace",color:T.text,padding:"5px 0",borderBottom:`1px solid ${T.border}`}}><span>{item.name} <span style={{color:T.dim}}>×{item.count}</span></span><span style={{color:T.gold}}>{item.value*item.count}g</span></div>)}
        </Panel>
      )}
      <Btn onClick={onBack} style={{width:"100%"}}>← Back</Btn>
    </div>
  );
};

// ── APP ───────────────────────────────────────────────────
export default function App(){
  useEffect(()=>{
    const link=document.createElement("link");link.rel="stylesheet";
    link.href="https://fonts.googleapis.com/css2?family=VT323&display=swap";
    document.head.appendChild(link);return()=>document.head.removeChild(link);
  },[]);

  const[screen,       setScreen]       =useState("title");
  const[player,       setPlayer]       =useState(null);
  const[enemy,        setEnemy]        =useState(null);
  const[combatLog,    setCombatLog]    =useState([]);
  const[combatPhase,  setCombatPhase]  =useState("player_turn");
  const[prevScreen,   setPrevScreen]   =useState("town");
  const[huntZone,     setHuntZone]     =useState("forest");
  const[currentAiZone,setCurrentAiZone]=useState(null);
  const[merchantOffer,setMerchantOffer]=useState(null);
  const[aiLoading,    setAiLoading]    =useState(false);
  const[aiLoadingMsg, setAiLoadingMsg] =useState("");
  const[pendingTalents,setPendingTalents]=useState([]);
  const[newZone,      setNewZone]      =useState(null);
  const[saveData,     setSaveData]     =useState(()=>loadGame());

  // Auto-save whenever player state changes
  useEffect(()=>{
    if(player) saveGame(player, screen, huntZone, currentAiZone);
  },[player]);

  const handleContinue=()=>{
    if(!saveData) return;
    setPlayer(saveData.player);
    setCurrentAiZone(saveData.currentAiZone||null);
    setHuntZone(saveData.huntZone||"forest");
    setScreen(saveData.screen||"town");
    setSaveData(null);
  };

  const handleNewGame=()=>{
    deleteSave();
    setSaveData(null);
    setScreen("name");
  };

  const pMaxLvl=player?.maxLevel??10;
  const level=player?getLevel(player.xp,pMaxLvl):1;
  const baseStats=player?calcStats(level,player.equipment):calcStats(1);
  const stats=player?{...baseStats,atk:baseStats.atk+(player.flatAtk||0),def:baseStats.def+(player.flatDef||0)}:baseStats;

  const handleName=(name)=>{setPlayer(mkPlayer(name));setSaveData(null);setScreen("town");};
  const doRest=()=>setPlayer(p=>{const s=calcStats(getLevel(p.xp,p.maxLevel),p.equipment);return{...p,hp:s.maxHp};});

  const evasionAttack=(p,e,s)=>{
    if(checkEvade(p))return{dmg:0,msg:`✦ ${e.name}'s attack misses! (Headdress evasion)`};
    const dmg=Math.max(1,e.atk+rand(-2,3)-s.def);
    return{dmg,msg:`🐾 The ${e.name} retaliates for ${dmg}!`};
  };

  const startFight=(e,zone,aiZone=null)=>{
    setHuntZone(zone);setCurrentAiZone(aiZone);
    if(e.special==="merchant"){setMerchantOffer(genOffer(player));setScreen("merchant_encounter");return;}
    if(e.special==="priest"){setScreen("priest_encounter");return;}
    setEnemy({...e,hp:e.maxHp});
    setCombatLog([`You venture into ${zone==="mountain"?"the mountain pass":zone==="forest"?"the shadowed forest":(aiZone?.zoneName||"the unknown")}...`,`A ${e.name} appears!`]);
    setCombatPhase("player_turn");setScreen("combat");
  };

  const handleAttack=()=>{
    if(combatPhase!=="player_turn")return;
    const newLog=[];
    const isCrit=player.critChance>0&&Math.random()<player.critChance;
    const hDmg=holyDmg(player);
    let pDmg=Math.max(1,stats.atk+rand(-2,4)-enemy.def)+hDmg;
    if(isCrit)pDmg=Math.floor(pDmg*2);
    newLog.push(`⚔ You strike for ${pDmg} damage!${isCrit?" ⚡ CRITICAL HIT!":""}${hDmg?` (+${hDmg} holy)`:""}`);
    const newEHP=Math.max(0,enemy.hp-pDmg);

    if(newEHP<=0){
      const drops=rollLootTable(enemy.loot||[],player.flags||{});
      const newFlags={...player.flags};
      if(drops.some(d=>d.name==="Book: Solid Strikes V1"))newFlags.solidStrikesDropped=true;
      const newXp=player.xp+enemy.xp;const newLvl=getLevel(newXp,player.maxLevel);const lvUp=newLvl>level;
      newLog.push(`💀 The ${enemy.name} collapses!`);
      newLog.push(`✨ +${enemy.xp} XP earned!`);
      if(drops.length>0)newLog.push(`📦 Loot: ${drops.map(d=>d.name).join(", ")}`);
      if(lvUp)newLog.push(`🌟 LEVEL UP!  You are now Level ${newLvl}!`);
      setEnemy(e=>({...e,hp:0}));
      setPlayer(p=>{const ns=calcStats(newLvl,p.equipment);return{...p,xp:newXp,inventory:[...p.inventory,...drops],hp:Math.min(p.hp+5,ns.maxHp),flags:newFlags};});
      setCombatLog(prev=>[...prev,...newLog]);setCombatPhase("victory");return;
    }
    const{dmg,msg}=evasionAttack(player,{...enemy,hp:newEHP},stats);
    newLog.push(msg);
    const newPHP=Math.max(0,player.hp-dmg);
    if(newPHP<=0){
      newLog.push(`💀 You fall unconscious...`);newLog.push(`You wake, battered.`);
      setEnemy(e=>({...e,hp:newEHP}));
      setPlayer(p=>({...p,hp:Math.max(1,Math.floor(stats.maxHp*0.3))}));
      setCombatLog(prev=>[...prev,...newLog]);setCombatPhase("defeat");return;
    }
    setEnemy(e=>({...e,hp:newEHP}));setPlayer(p=>({...p,hp:newPHP}));setCombatLog(prev=>[...prev,...newLog]);
  };

  const handleFlee=()=>{
    const threshold=0.42-(player.fleeBonus||0);
    if(Math.random()>threshold){setCombatLog(prev=>[...prev,"🏃 You dash to safety!"]);setCombatPhase("fled");}
    else{const{dmg,msg}=evasionAttack(player,enemy,stats);setPlayer(p=>({...p,hp:Math.max(1,p.hp-dmg)}));setCombatLog(prev=>[...prev,`🏃 Failed to flee! ${msg}`]);}
  };

  const handleUseItem=(itemName)=>{
    const sp=SPECIAL[itemName];if(!sp||sp.type!=="usable")return;
    const idx=player.inventory.findIndex(i=>i.name===itemName);if(idx===-1)return;
    const heal=rand(sp.healMin,sp.healMax);const inv=[...player.inventory];inv.splice(idx,1);
    setPlayer(p=>({...p,hp:Math.min(p.hp+heal,stats.maxHp),inventory:inv}));
    setCombatLog(prev=>[...prev,`${itemName==="Warm Milk"?"🥛":"🍺"} You drink the ${itemName} and recover ${heal} HP!  [free action]`]);
  };

  const handleSell=(itemName)=>setPlayer(p=>{
    const idx=p.inventory.findIndex(i=>i.name===itemName);if(idx===-1)return p;
    const item=p.inventory[idx];const inv=[...p.inventory];inv.splice(idx,1);
    return{...p,gold:p.gold+sellValue(p,item.value),inventory:inv};
  });
  const handleSellAll=()=>setPlayer(p=>{
    const loot=p.inventory.filter(i=>isSellable(i.name));const others=p.inventory.filter(i=>!isSellable(i.name));
    return{...p,gold:p.gold+loot.reduce((s,i)=>s+sellValue(p,i.value),0),inventory:others};
  });
  const handleBuy=(item)=>setPlayer(p=>{
    if(p.gold<item.cost)return p;
    const eq={...p.equipment,[item.slot]:item};const ns=calcStats(getLevel(p.xp,p.maxLevel),eq);
    return{...p,gold:p.gold-item.cost,equipment:eq,hp:Math.min(p.hp,ns.maxHp)};
  });
  const handleOpenSack=(sackName)=>setPlayer(p=>{
    const idx=p.inventory.findIndex(i=>i.name===sackName);if(idx===-1)return p;
    const sp=SPECIAL[sackName];const g=rand(sp.goldMin,sp.goldMax);const inv=[...p.inventory];inv.splice(idx,1);
    return{...p,gold:p.gold+g,inventory:inv};
  });
  const handleReadBook=(bookName)=>setPlayer(p=>{
    const idx=p.inventory.findIndex(i=>i.name===bookName);if(idx===-1)return p;
    const sp=SPECIAL[bookName];const inv=[...p.inventory];inv.splice(idx,1);
    const flags={...p.flags};let up={...p,inventory:inv};
    if(sp.effect==="solidStrikes"){up={...up,critChance:(p.critChance||0)+0.01};flags.solidStrikesDropped=true;}
    if(sp.effect==="ironWill")    {up={...up,flatDef:(p.flatDef||0)+5};flags.ironWillLearned=true;}
    if(sp.effect==="battleHymn")  {up={...up,flatAtk:(p.flatAtk||0)+5};flags.battleHymnLearned=true;}
    if(sp.effect==="swiftFeet")   {up={...up,fleeBonus:(p.fleeBonus||0)+0.15};flags.swiftFeetLearned=true;}
    if(sp.effect==="expandedMind"){up={...up,maxLevel:15};flags.expandedMindLearned=true;}
    return{...up,flags};
  });
  const handleBuyMap=()=>setPlayer(p=>p.gold<1000?p:{...p,gold:p.gold-1000,inventory:[...p.inventory,{name:"Mountain Map",value:0}]});
  const handleForge=(id)=>{const r=RECIPES.find(x=>x.id===id);if(r&&r.canCraft(player))setPlayer(p=>r.forge(p));};

  // ── AI MAP: generate zone via NVIDIA API ─────────────────
  const handleUseMap=async(mapName)=>{
    if(player.unlockedZones.some(z=>z.mapName===mapName)){alert("Zone already unlocked!");return;}
    // Consume map from inventory
    setPlayer(p=>{const idx=p.inventory.findIndex(i=>i.name===mapName);if(idx===-1)return p;const inv=[...p.inventory];inv.splice(idx,1);return{...p,inventory:inv};});
    setAiLoadingMsg(`The AI is building ${ZONE_CFG[mapName]?.theme||mapName.replace(" Map","")}...\nThis takes about 10–20 seconds.`);
    setScreen("ai_loading");
    try{
      const zone=await generateZone(mapName,level,stats.atk,stats.def);
      if(zone){
        setPlayer(p=>({...p,unlockedZones:[...p.unlockedZones,zone]}));
        setNewZone(zone);setScreen("zone_unlocked");
      } else {
        alert("Zone generation failed — map returned to bag.");
        setPlayer(p=>({...p,inventory:[...p.inventory,{name:mapName,value:0}]}));
        setScreen("town");
      }
    }catch(e){
      console.error(e);
      alert("NVIDIA API error. Check your API key. Map returned to bag.");
      setPlayer(p=>({...p,inventory:[...p.inventory,{name:mapName,value:0}]}));
      setScreen("town");
    }
  };

  // ── AI TALENT: generate via NVIDIA API ───────────────────
  const handleUseTalentChit=async()=>{
    // Consume chit
    setPlayer(p=>{const idx=p.inventory.findIndex(i=>i.name==="Talent Chit");if(idx===-1)return p;const inv=[...p.inventory];inv.splice(idx,1);return{...p,inventory:inv};});
    setAiLoadingMsg("The AI is forging your destiny...\nChoose wisely. This is permanent.");
    setScreen("ai_loading");
    try{
      const talents=await generateTalents(level,Math.round((player.critChance||0)*100),hasHeaddress(player),player.flatAtk||0,player.flatDef||0);
      setPendingTalents(talents);setScreen("talent_selection");
    }catch(e){
      console.error(e);
      setPendingTalents(TALENT_FALLBACK);setScreen("talent_selection");
    }
  };

  const handlePickTalent=(talent)=>{
    setPlayer(p=>{
      let up={...p,learnedTalents:[...(p.learnedTalents||[]),talent]};
      if(talent.effect==="atk")        up={...up,flatAtk:(p.flatAtk||0)+talent.value};
      if(talent.effect==="def")        up={...up,flatDef:(p.flatDef||0)+talent.value};
      if(talent.effect==="hp")         {const ns=calcStats(getLevel(p.xp,p.maxLevel),p.equipment);up={...up};}
      if(talent.effect==="crit")       up={...up,critChance:(p.critChance||0)+talent.value};
      if(talent.effect==="flee")       up={...up,fleeBonus:(p.fleeBonus||0)+talent.value};
      if(talent.effect==="evasion")    up={...up}; // Headdress handles evasion via item; talent evasion tracked via learnedTalents
      if(talent.effect==="holy_perm")  up={...up,holyPermDmg:(p.holyPermDmg||0)+talent.value};
      // HP bonus: recalculate max
      if(talent.effect==="hp"){const ns=calcStats(getLevel(p.xp,p.maxLevel),p.equipment);up={...up};}
      return up;
    });
    setPendingTalents([]);setScreen("town");
  };

  const handleCancelTalent=()=>{
    // Return chit
    setPlayer(p=>({...p,inventory:[...p.inventory,{name:"Talent Chit",value:0}]}));
    setPendingTalents([]);setScreen("town");
  };

  const handleMerchantBuy=(offer)=>{
    if(!offer||player.gold<offer.cost)return;
    setPlayer(p=>{
      let np={...p,gold:p.gold-offer.cost};
      if(["recipe","key","usable","book"].includes(offer.type))np={...np,inventory:[...np.inventory,{name:offer.name,value:0}]};
      else if(offer.type==="gear"&&offer.item){const eq={...np.equipment,[offer.item.slot]:offer.item};const ns=calcStats(getLevel(np.xp,np.maxLevel),eq);np={...np,equipment:eq,hp:Math.min(np.hp,ns.maxHp)};}
      return np;
    });
    setScreen(huntZone==="mountain"?"mountain_camp":currentAiZone?`ai_zone_${currentAiZone.id}`:"town");
  };

  const handlePriestDonate=()=>setPlayer(p=>{
    if(p.gold<500)return p;const np={...p,gold:p.gold-500};
    if(!p.flags.expandedMindLearned)return{...np,inventory:[...np.inventory,{name:"Book: Expansive Mind",value:0}]};
    return{...np,holyExpiry:Date.now()+5*60*1000};
  });

  const goStats=(from)=>{setPrevScreen(from);setScreen("stats");};
  const returnFromCombat=()=>{
    if(huntZone==="mountain")setScreen("mountain_camp");
    else if(huntZone==="ai_zone"&&currentAiZone)setScreen("ai_zone_camp");
    else setScreen("town");
  };
  const huntAgain=()=>{
    if(huntZone==="mountain")startFight(spawnMountain(),"mountain");
    else if(huntZone==="ai_zone"&&currentAiZone)startFight(spawnFromZone(currentAiZone),"ai_zone",currentAiZone);
    else startFight(spawnForest(),"forest");
  };

  const inMountain=["mountain_camp","blacksmith"].includes(screen)||(screen==="combat"&&huntZone==="mountain");
  const inAiZone  =screen==="ai_zone_camp"||(screen==="combat"&&huntZone==="ai_zone");

  return(
    <div style={{background:T.bg,minHeight:"100vh",display:"flex",justifyContent:"center",alignItems:"flex-start",padding:"16px 8px",fontFamily:"'VT323',monospace"}}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      <div style={{width:"100%",maxWidth:420,background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,boxShadow:"0 0 60px rgba(74,222,128,0.06)",overflow:"hidden",wordBreak:"break-word"}}>
        {/* Top bar */}
        <div style={{background:T.panel,borderBottom:`1px solid ${T.border}`,padding:"7px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"0.9rem",letterSpacing:"0.1em"}}>BYZANTIUM</span>
          {player&&<span style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.82rem"}}>
            Lv{level}  ·  {player.gold}g
            {hasHeaddress(player)&&<span style={{color:T.purple}}> · ✦</span>}
            {player.critChance>0&&<span style={{color:T.gold}}> · ⚡</span>}
            {hasHoly(player)&&<span style={{color:T.blue}}> · ☩</span>}
          </span>}
        </div>

        {screen==="title"         &&<TitleScreen onStart={handleNewGame} onContinue={handleContinue} saveData={saveData}/>}
        {screen==="name"          &&<NameScreen  onConfirm={handleName}/>}
        {screen==="ai_loading"    &&<LoadingScreen message={aiLoadingMsg}/>}
        {screen==="zone_unlocked" &&newZone&&<ZoneUnlockedScreen zone={newZone} onEnter={()=>{setCurrentAiZone(newZone);setNewZone(null);setScreen("ai_zone_camp");}} onLater={()=>{setNewZone(null);setScreen("town");}}/>}
        {screen==="talent_selection"&&<TalentSelectionScreen talents={pendingTalents} onPick={handlePickTalent} onCancel={handleCancelTalent}/>}

        {screen==="town"&&player&&(
          <TownScreen player={player} level={level} stats={stats}
            onForest={()=>startFight(spawnForest(),"forest")}
            onShop={()=>setScreen("shop")}
            onStats={()=>goStats("town")}
            onRest={doRest}
            onMountain={()=>setScreen("mountain_camp")}
            onEnterZone={z=>{setCurrentAiZone(z);setScreen("ai_zone_camp");}}
          />
        )}
        {screen==="mountain_camp"&&player&&<MountainCampScreen player={player} level={level} stats={stats} onHunt={()=>startFight(spawnMountain(),"mountain")} onBlacksmith={()=>setScreen("blacksmith")} onStats={()=>goStats("mountain_camp")} onRest={doRest} onReturn={()=>setScreen("town")}/>}
        {screen==="ai_zone_camp"&&player&&currentAiZone&&<AiZoneCampScreen zone={currentAiZone} player={player} level={level} stats={stats} onHunt={()=>startFight(spawnFromZone(currentAiZone),"ai_zone",currentAiZone)} onStats={()=>goStats("ai_zone_camp")} onRest={doRest} onReturn={()=>setScreen("town")}/>}
        {screen==="combat"&&player&&enemy&&<CombatScreen player={player} stats={stats} enemy={enemy} log={combatLog} phase={combatPhase} onAttack={handleAttack} onFlee={handleFlee} onUseItem={handleUseItem} onReturn={returnFromCombat} onHuntAgain={huntAgain}/>}
        {screen==="merchant_encounter"&&player&&<MerchantEncounterScreen player={player} stats={stats} offer={merchantOffer} onBuy={handleMerchantBuy} onLeave={()=>setScreen(huntZone==="mountain"?"mountain_camp":currentAiZone?"ai_zone_camp":"town")}/>}
        {screen==="priest_encounter"&&player&&<PriestEncounterScreen player={player} stats={stats} onDonate={()=>{handlePriestDonate();setScreen(huntZone==="mountain"?"mountain_camp":"town");}} onLeave={()=>setScreen(huntZone==="mountain"?"mountain_camp":"town")}/>}
        {screen==="shop"&&player&&(
          <ShopScreen player={player} level={level}
            onSell={handleSell} onSellAll={handleSellAll} onBuy={handleBuy}
            onOpenSack={handleOpenSack} onReadBook={handleReadBook}
            onBuyMap={handleBuyMap}
            onUseMap={name=>{setScreen("town");setTimeout(()=>handleUseMap(name),50);}}
            onUseTalentChit={()=>{setScreen("town");setTimeout(()=>handleUseTalentChit(),50);}}
            onBack={()=>setScreen("town")}
          />
        )}
        {screen==="blacksmith"&&player&&<BlacksmithScreen player={player} onForge={handleForge} onBack={()=>setScreen("mountain_camp")}/>}
        {screen==="stats"&&player&&<StatsScreen player={player} level={level} stats={stats} onBack={()=>setScreen(prevScreen)}/>}

        {/* Town items tab: handle map + talent chit use buttons */}
        {/* Handled inline: maps and talent chits show "Use in Village" — actual use buttons added to shop items tab */}

        {/* Footer */}
        <div style={{borderTop:`1px solid ${T.border}`,padding:"6px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#1a3320",fontFamily:"'VT323',monospace",fontSize:"0.72rem"}}>
            {inMountain?"Zone II: The Mountain":inAiZone&&currentAiZone?currentAiZone.zoneName:"Zone I: The Forest"}
          </span>
          {player&&!["title","name","combat","ai_loading","zone_unlocked","talent_selection"].includes(screen)&&(
            <span onClick={()=>goStats(screen)} style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.72rem",cursor:"pointer"}}>[ stats ]</span>
          )}
        </div>
      </div>
    </div>
  );
}
