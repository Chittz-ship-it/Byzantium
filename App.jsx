import { useState, useEffect, useRef } from "react";

// ── THEME ─────────────────────────────────────────────────
const T = {
  bg:"#06100a", panel:"#0b1a10", border:"#1a3d20", borderBright:"#2d6e35",
  gold:"#d4a843", green:"#4ade80", greenDim:"#1f5c2e", text:"#c8ddc0",
  dim:"#3d6b45", red:"#f87171", amber:"#fbbf24", blue:"#93c5fd",
  purple:"#c084fc", white:"#e8f5e0", steel:"#94a3b8",
};

// ── HELPERS ───────────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const rollLootTable = (table, flags = {}) => {
  const r = Math.random() * 100;
  let cum = 0;
  for (const entry of table) {
    cum += entry.weight;
    if (r < cum) {
      if (entry.name === "nothing") return [];
      if (entry.unique && flags[entry.uniqueFlag]) return [];
      const value = typeof entry.value === "function" ? entry.value() : (entry.value ?? 0);
      return [{ name: entry.name, value: Math.floor(value) }];
    }
  }
  return [];
};

// ── SPECIAL ITEMS ─────────────────────────────────────────
const SPECIAL = {
  "Warm Ale":                { type:"usable",   healMin:15, healMax:25 },
  "Warm Milk":               { type:"usable",   healMin:30, healMax:45 },
  "Sack of Coin":            { type:"openable", goldMin:10, goldMax:20 },
  "Large Sack of Coin":      { type:"openable", goldMin:20, goldMax:40 },
  "Merchant Seal":           { type:"key",      desc:"+10% gold from merchant" },
  "Mountain Map":            { type:"key",      desc:"Unlocks The Mountain zone" },
  "Headdress":               { type:"key",      desc:"+1% evasion in combat" },
  "Treasure Key":            { type:"key",      desc:"Opens treasure chests · Coming soon" },
  "Churchyard Map":          { type:"key",      desc:"The old churchyard awaits · Coming soon" },
  "Swamp Map":               { type:"key",      desc:"The dark swamp lurks · Coming soon" },
  "Spiritworld Map":         { type:"key",      desc:"The veil between worlds · Coming soon" },
  "Talent Chit":             { type:"key",      desc:"Used in the skill tree · Coming soon" },
  "Book: Solid Strikes V1":  { type:"book",     desc:"+1% crit · Critical hits deal double damage", effect:"solidStrikes" },
  "Book: Iron Will":         { type:"book",     desc:"Permanently +5 DEF", effect:"ironWill" },
  "Book: Battle Hymn":       { type:"book",     desc:"Permanently +5 ATK", effect:"battleHymn" },
  "Book: Swift Feet":        { type:"book",     desc:"+15% flee success rate", effect:"swiftFeet" },
  "Book: Expansive Mind":    { type:"book",     desc:"Raises level cap from 10 to 15", effect:"expandedMind" },
  "Recipe for Shadowfang ★": { type:"recipe",   desc:"Alt forge: Shadowfang ★ · Shadowfang + 5 bone types" },
  "Recipe: Shadowfang":      { type:"recipe",   desc:"Forge Shadowfang · Forest Blade + 3 Fox Pelts" },
  "Recipe: Shadow Cloak":    { type:"recipe",   desc:"Forge Shadow Cloak · Iron Plate + 2 Boar Hides" },
  "Recipe: King's Seal":     { type:"recipe",   desc:"Forge King's Seal · Defender's Band + Crown of Tusks" },
  "Recipe: Void Shard":      { type:"recipe",   desc:"Forge Void Shard · Moonstone Drop + Silver Earring" },
};

const isSellable   = (n) => !SPECIAL[n];
const hasSeal      = (p) => p.inventory.some(i => i.name === "Merchant Seal");
const hasMap       = (p) => p.inventory.some(i => i.name === "Mountain Map");
const hasHeaddress = (p) => p.inventory.some(i => i.name === "Headdress");
const sellValue    = (p, v) => hasSeal(p) ? Math.floor(v * 1.1) : v;
const checkEvade   = (p) => hasHeaddress(p) && Math.random() < 0.01;
const holyDmg      = (p) => (Date.now() < (p.holyExpiry || 0)) ? 10 : 0;
const hasHoly      = (p) => Date.now() < (p.holyExpiry || 0);

// ── SHOP ─────────────────────────────────────────────────
const SHOP = {
  weapons: [
    { id:"stick",      name:"Gnarled Stick",   slot:"weapon", cost:0,   atk:0  },
    { id:"dagger",     name:"Rusty Dagger",     slot:"weapon", cost:25,  atk:3  },
    { id:"sword",      name:"Iron Sword",        slot:"weapon", cost:80,  atk:8  },
    { id:"blade",      name:"Forest Blade",      slot:"weapon", cost:200, atk:16 },
    { id:"shadowfang", name:"Shadowfang",        slot:"weapon", cost:500, atk:28 },
  ],
  armour: [
    { id:"rags",    name:"Tattered Rags",  slot:"armour", cost:0,   def:0,  hp:0  },
    { id:"leather", name:"Leather Jerkin", slot:"armour", cost:30,  def:2,  hp:10 },
    { id:"chain",   name:"Chainmail Vest", slot:"armour", cost:100, def:5,  hp:22 },
    { id:"plate",   name:"Iron Plate",     slot:"armour", cost:250, def:10, hp:40 },
    { id:"shadow",  name:"Shadow Cloak",   slot:"armour", cost:600, def:16, hp:65 },
  ],
  rings: [
    { id:"copper_ring",   name:"Copper Ring",    slot:"ring", cost:40,  atk:1, def:1       },
    { id:"jade_band",     name:"Jade Band",       slot:"ring", cost:120, hp:28               },
    { id:"blood_ring",    name:"Blood Ring",      slot:"ring", cost:300, atk:6               },
    { id:"defender_band", name:"Defender's Band", slot:"ring", cost:180, def:6               },
    { id:"kings_seal",    name:"King's Seal",     slot:"ring", cost:550, atk:5, def:4, hp:20 },
  ],
  earrings: [
    { id:"bone_hook",   name:"Bone Hook",       slot:"earring", cost:35,  def:2               },
    { id:"silver_drop", name:"Silver Drop",      slot:"earring", cost:90,  atk:2, def:1       },
    { id:"hunters",     name:"Hunter's Earring", slot:"earring", cost:160, atk:5               },
    { id:"moonstone",   name:"Moonstone Drop",   slot:"earring", cost:350, atk:3, hp:22       },
    { id:"void_shard",  name:"Void Shard",       slot:"earring", cost:620, atk:8, def:3, hp:15 },
  ],
};

const DEFAULT_EQUIP = { weapon:SHOP.weapons[0], armour:SHOP.armour[0], ring:null, earring:null };

const statLabel = (item) => {
  if (!item) return "—";
  const p = [];
  if (item.atk) p.push(`+${item.atk} ATK`);
  if (item.def) p.push(`+${item.def} DEF`);
  if (item.hp)  p.push(`+${item.hp} HP`);
  return p.join("  ") || "—";
};

// ── BLACKSMITH RECIPES ────────────────────────────────────
// requiresRecipe: name of recipe item that must be in inventory (null = always visible)
const RECIPES = [
  // ── Always unlocked ──────────────────────────────────────
  {
    id:"headdress", requiresRecipe:null,
    name:"Headdress", flavor:"Woven from five enchanted feathers. Spectral protection.",
    outputDesc:"Key Item · +1% evasion in combat",
    ingredients:[
      { label:"Red Feather",    has:p=>p.inventory.some(i=>i.name==="Red Feather")    },
      { label:"Blue Feather",   has:p=>p.inventory.some(i=>i.name==="Blue Feather")   },
      { label:"Green Feather",  has:p=>p.inventory.some(i=>i.name==="Green Feather")  },
      { label:"Orange Feather", has:p=>p.inventory.some(i=>i.name==="Orange Feather") },
      { label:"Purple Feather", has:p=>p.inventory.some(i=>i.name==="Purple Feather") },
    ],
    canCraft:    p=>["Red Feather","Blue Feather","Green Feather","Orange Feather","Purple Feather"].every(f=>p.inventory.some(i=>i.name===f)),
    alreadyHave: p=>p.inventory.some(i=>i.name==="Headdress"),
    forge: p=>{
      let inv=[...p.inventory];
      for (const f of ["Red Feather","Blue Feather","Green Feather","Orange Feather","Purple Feather"]){
        const idx=inv.findIndex(i=>i.name===f); if(idx!==-1) inv.splice(idx,1);
      }
      inv.push({name:"Headdress",value:0});
      return {...p,inventory:inv};
    },
  },
  {
    id:"shadowfang_plus", requiresRecipe:null,
    name:"Shadowfang ★", flavor:"Shadowfang imbued with purple fox essence. Devastating.",
    outputDesc:"Weapon · +42 ATK · Replaces Shadowfang",
    ingredients:[
      { label:"Shadowfang (equipped)", has:p=>p.equipment.weapon?.id==="shadowfang" },
      { label:"Purple Fox Pelt",       has:p=>p.inventory.some(i=>i.name==="Purple Fox Pelt") },
    ],
    canCraft:    p=>p.equipment.weapon?.id==="shadowfang"&&p.inventory.some(i=>i.name==="Purple Fox Pelt"),
    alreadyHave: p=>p.equipment.weapon?.id==="shadowfang_plus"||p.equipment.weapon?.id==="shadowfang_plus_alt",
    forge: p=>{
      const upg={id:"shadowfang_plus",name:"Shadowfang ★",slot:"weapon",cost:0,atk:42};
      let inv=[...p.inventory]; const idx=inv.findIndex(i=>i.name==="Purple Fox Pelt"); if(idx!==-1) inv.splice(idx,1);
      return {...p,inventory:inv,equipment:{...p.equipment,weapon:upg}};
    },
  },
  {
    id:"warlords_cloak", requiresRecipe:null,
    name:"Warlord's Cloak", flavor:"Shadow Cloak reinforced with boar hide. Near impenetrable.",
    outputDesc:"Armour · +18 DEF · +80 HP · Replaces Shadow Cloak",
    ingredients:[
      { label:"Shadow Cloak (equipped)", has:p=>p.equipment.armour?.id==="shadow" },
      { label:"Boar Hide",               has:p=>p.inventory.some(i=>i.name==="Boar Hide") },
    ],
    canCraft:    p=>p.equipment.armour?.id==="shadow"&&p.inventory.some(i=>i.name==="Boar Hide"),
    alreadyHave: p=>p.equipment.armour?.id==="warlords_cloak",
    forge: p=>{
      const upg={id:"warlords_cloak",name:"Warlord's Cloak",slot:"armour",cost:0,def:18,hp:80};
      let inv=[...p.inventory]; const idx=inv.findIndex(i=>i.name==="Boar Hide"); if(idx!==-1) inv.splice(idx,1);
      const eq={...p.equipment,armour:upg};
      return {...p,inventory:inv,equipment:eq,hp:Math.min(p.hp,calcStats(getLevel(p.xp,p.maxLevel),eq).maxHp)};
    },
  },
  {
    id:"amethyst_seal", requiresRecipe:null,
    name:"King's Amethyst Seal", flavor:"The King's Seal set with a forest amethyst. Radiant power.",
    outputDesc:"Ring · +8 ATK · +6 DEF · +25 HP · Replaces King's Seal",
    ingredients:[
      { label:"King's Seal (equipped as ring)", has:p=>p.equipment.ring?.id==="kings_seal" },
      { label:"Amethyst",                       has:p=>p.inventory.some(i=>i.name==="Amethyst") },
    ],
    canCraft:    p=>p.equipment.ring?.id==="kings_seal"&&p.inventory.some(i=>i.name==="Amethyst"),
    alreadyHave: p=>p.equipment.ring?.id==="amethyst_seal",
    forge: p=>{
      const upg={id:"amethyst_seal",name:"King's Amethyst Seal",slot:"ring",cost:0,atk:8,def:6,hp:25};
      let inv=[...p.inventory]; const idx=inv.findIndex(i=>i.name==="Amethyst"); if(idx!==-1) inv.splice(idx,1);
      const eq={...p.equipment,ring:upg};
      return {...p,inventory:inv,equipment:eq,hp:Math.min(p.hp,calcStats(getLevel(p.xp,p.maxLevel),eq).maxHp)};
    },
  },
  {
    id:"void_shard_plus", requiresRecipe:null,
    name:"Void Shard ★", flavor:"The Void Shard threaded with silver. It hums with dark energy.",
    outputDesc:"Earring · +12 ATK · +5 DEF · +22 HP · Replaces Void Shard",
    ingredients:[
      { label:"Void Shard (equipped as earring)", has:p=>p.equipment.earring?.id==="void_shard" },
      { label:"Silver Earring",                   has:p=>p.inventory.some(i=>i.name==="Silver Earring") },
    ],
    canCraft:    p=>p.equipment.earring?.id==="void_shard"&&p.inventory.some(i=>i.name==="Silver Earring"),
    alreadyHave: p=>p.equipment.earring?.id==="void_shard_plus",
    forge: p=>{
      const upg={id:"void_shard_plus",name:"Void Shard ★",slot:"earring",cost:0,atk:12,def:5,hp:22};
      let inv=[...p.inventory]; const idx=inv.findIndex(i=>i.name==="Silver Earring"); if(idx!==-1) inv.splice(idx,1);
      const eq={...p.equipment,earring:upg};
      return {...p,inventory:inv,equipment:eq,hp:Math.min(p.hp,calcStats(getLevel(p.xp,p.maxLevel),eq).maxHp)};
    },
  },
  // ── Requires "Recipe for Shadowfang ★" drop ──────────────
  {
    id:"shadowfang_plus_alt", requiresRecipe:"Recipe for Shadowfang ★",
    name:"Shadowfang ★ (Alt)", flavor:"Five bone types fused into the blade. A warrior's path.",
    outputDesc:"Weapon · +42 ATK · Alternative path to Shadowfang ★",
    ingredients:[
      { label:"Shadowfang (equipped)", has:p=>p.equipment.weapon?.id==="shadowfang" },
      { label:"Tiny Bones",            has:p=>p.inventory.some(i=>i.name==="Tiny Bones")  },
      { label:"Mini Bones",            has:p=>p.inventory.some(i=>i.name==="Mini Bones")  },
      { label:"Small Bones",           has:p=>p.inventory.some(i=>i.name==="Small Bones") },
      { label:"Boar Bones",            has:p=>p.inventory.some(i=>i.name==="Boar Bones")  },
      { label:"Magic Bones",           has:p=>p.inventory.some(i=>i.name==="Magic Bones") },
    ],
    canCraft:p=>p.equipment.weapon?.id==="shadowfang"&&["Tiny Bones","Mini Bones","Small Bones","Boar Bones","Magic Bones"].every(b=>p.inventory.some(i=>i.name===b)),
    alreadyHave:p=>p.equipment.weapon?.id==="shadowfang_plus"||p.equipment.weapon?.id==="shadowfang_plus_alt",
    forge:p=>{
      const upg={id:"shadowfang_plus_alt",name:"Shadowfang ★",slot:"weapon",cost:0,atk:42};
      let inv=[...p.inventory];
      for(const b of["Tiny Bones","Mini Bones","Small Bones","Boar Bones","Magic Bones"]){
        const idx=inv.findIndex(i=>i.name===b); if(idx!==-1) inv.splice(idx,1);
      }
      return {...p,inventory:inv,equipment:{...p.equipment,weapon:upg}};
    },
  },
  // ── Merchant recipe unlocks ───────────────────────────────
  {
    id:"craft_shadowfang", requiresRecipe:"Recipe: Shadowfang",
    name:"Craft: Shadowfang", flavor:"Forge a Shadowfang from forest materials. No coin required.",
    outputDesc:"Weapon · +28 ATK · Equips Shadowfang",
    ingredients:[
      { label:"Forest Blade (in inventory)", has:p=>p.inventory.some(i=>i.name==="Forest Blade")||p.equipment.weapon?.id==="blade" },
      { label:"Fox Pelt ×3",                 has:p=>p.inventory.filter(i=>i.name==="Fox Pelt").length>=3 },
    ],
    canCraft:p=>(p.inventory.some(i=>i.name==="Forest Blade")||p.equipment.weapon?.id==="blade")&&p.inventory.filter(i=>i.name==="Fox Pelt").length>=3,
    alreadyHave:p=>["shadowfang","shadowfang_plus","shadowfang_plus_alt"].includes(p.equipment.weapon?.id),
    forge:p=>{
      const upg=SHOP.weapons[4];
      let inv=[...p.inventory];
      const bladeIdx=inv.findIndex(i=>i.name==="Forest Blade");
      if(bladeIdx!==-1) inv.splice(bladeIdx,1);
      let removed=0;
      inv=inv.filter(i=>{ if(i.name==="Fox Pelt"&&removed<3){removed++;return false;} return true; });
      return {...p,inventory:inv,equipment:{...p.equipment,weapon:upg}};
    },
  },
  {
    id:"craft_shadow_cloak", requiresRecipe:"Recipe: Shadow Cloak",
    name:"Craft: Shadow Cloak", flavor:"Stitch the plates into shadow. A ranger's armour.",
    outputDesc:"Armour · +16 DEF · +65 HP · Equips Shadow Cloak",
    ingredients:[
      { label:"Iron Plate (in inventory or equipped)", has:p=>p.inventory.some(i=>i.name==="Iron Plate")||p.equipment.armour?.id==="plate" },
      { label:"Boar Hide ×2",                         has:p=>p.inventory.filter(i=>i.name==="Boar Hide").length>=2 },
    ],
    canCraft:p=>(p.inventory.some(i=>i.name==="Iron Plate")||p.equipment.armour?.id==="plate")&&p.inventory.filter(i=>i.name==="Boar Hide").length>=2,
    alreadyHave:p=>["shadow","warlords_cloak"].includes(p.equipment.armour?.id),
    forge:p=>{
      const upg=SHOP.armour[4];
      let inv=[...p.inventory];
      const plateIdx=inv.findIndex(i=>i.name==="Iron Plate");
      if(plateIdx!==-1) inv.splice(plateIdx,1);
      let removed=0;
      inv=inv.filter(i=>{ if(i.name==="Boar Hide"&&removed<2){removed++;return false;} return true; });
      const eq={...p.equipment,armour:upg};
      return {...p,inventory:inv,equipment:eq,hp:Math.min(p.hp,calcStats(getLevel(p.xp,p.maxLevel),eq).maxHp)};
    },
  },
  {
    id:"craft_kings_seal", requiresRecipe:"Recipe: King's Seal",
    name:"Craft: King's Seal", flavor:"A champion's band, reforged from bone and gemstone.",
    outputDesc:"Ring · +5 ATK · +4 DEF · +20 HP · Equips King's Seal",
    ingredients:[
      { label:"Defender's Band (equipped as ring)", has:p=>p.equipment.ring?.id==="defender_band" },
      { label:"Crown of Tusks",                     has:p=>p.inventory.some(i=>i.name==="Crown of Tusks") },
    ],
    canCraft:p=>p.equipment.ring?.id==="defender_band"&&p.inventory.some(i=>i.name==="Crown of Tusks"),
    alreadyHave:p=>["kings_seal","amethyst_seal"].includes(p.equipment.ring?.id),
    forge:p=>{
      const upg=SHOP.rings[4];
      let inv=[...p.inventory]; const idx=inv.findIndex(i=>i.name==="Crown of Tusks"); if(idx!==-1) inv.splice(idx,1);
      const eq={...p.equipment,ring:upg};
      return {...p,inventory:inv,equipment:eq,hp:Math.min(p.hp,calcStats(getLevel(p.xp,p.maxLevel),eq).maxHp)};
    },
  },
  {
    id:"craft_void_shard", requiresRecipe:"Recipe: Void Shard",
    name:"Craft: Void Shard", flavor:"Moon and silver, forged into void. A powerful trinket.",
    outputDesc:"Earring · +8 ATK · +3 DEF · +15 HP · Equips Void Shard",
    ingredients:[
      { label:"Moonstone Drop (equipped as earring)", has:p=>p.equipment.earring?.id==="moonstone" },
      { label:"Silver Earring",                       has:p=>p.inventory.some(i=>i.name==="Silver Earring") },
    ],
    canCraft:p=>p.equipment.earring?.id==="moonstone"&&p.inventory.some(i=>i.name==="Silver Earring"),
    alreadyHave:p=>["void_shard","void_shard_plus"].includes(p.equipment.earring?.id),
    forge:p=>{
      const upg=SHOP.earrings[4];
      let inv=[...p.inventory]; const idx=inv.findIndex(i=>i.name==="Silver Earring"); if(idx!==-1) inv.splice(idx,1);
      const eq={...p.equipment,earring:upg};
      return {...p,inventory:inv,equipment:eq,hp:Math.min(p.hp,calcStats(getLevel(p.xp,p.maxLevel),eq).maxHp)};
    },
  },
];

// ── FOREST ENEMIES (all loot sums to 100) ─────────────────
const FOREST_ENEMIES = {
  rabbit:  { id:"rabbit",  name:"Wild Rabbit",    art:["  (\\(\\   ","  ( •ᴗ•) ","  o(\")(\")"], color:"#a8e6cf", maxHp:18,  atk:4,  def:0,  xp:12,  weight:24,
    loot:[{name:"Rabbit Pelt",weight:50,value:12},{name:"Tiny Bones",weight:20,value:4},{name:"Silver Earring",weight:2,value:45},{name:"nothing",weight:28}] },
  vole:    { id:"vole",    name:"Field Vole",      art:["   ,--,  ","  (·ω·)  ","   mm mm "],  color:"#d4b896", maxHp:25,  atk:7,  def:1,  xp:18,  weight:24,
    loot:[{name:"Vole Pelt",weight:50,value:8},{name:"Mini Bones",weight:20,value:3},{name:"Bronze Monocle",weight:2,value:30},{name:"nothing",weight:28}] },
  fox:     { id:"fox",     name:"Forest Fox",      art:["  /^\\/^  "," ( °ᴥ° ) ","  )    ( "],  color:"#f97316", maxHp:45,  atk:12, def:4,  xp:45,  weight:24,
    loot:[{name:"Fox Pelt",weight:50,value:18},{name:"Small Bones",weight:20,value:5},{name:"Copper Ring",weight:2,value:35},{name:"nothing",weight:28}] },
  peasant: { id:"peasant", name:"Rabid Peasant",   art:["   \\O/   ","    |    ","   / \\  "],   color:"#86efac", maxHp:35,  atk:11, def:2,  xp:32,  weight:24,
    loot:[{name:"Loincloth",weight:50,value:8},{name:"Warm Ale",weight:20,value:0},{name:"Sack of Coin",weight:2,value:0},{name:"nothing",weight:28}] },
  purplefox:{ id:"purplefox",name:"Purple Fox",    art:["  /^\\/^  "," ( ×ᴥ× ) ","  )~✦~( "],  color:"#c084fc", maxHp:75,  atk:20, def:8,  xp:90,  weight:1,
    loot:[{name:"Purple Fox Pelt",weight:50,value:55},{name:"Magic Bones",weight:20,value:28},{name:"Amethyst",weight:2,value:75},{name:"nothing",weight:28}] },
  parrot:  { id:"parrot",  name:"Wild Parrot",     art:["   _/\\_  ","  (o o)  "," <=|U|=> "],  color:"#4ade80", maxHp:28,  atk:9,  def:2,  xp:25,  weight:1,
    loot:[{name:"Red Feather",weight:20,value:10},{name:"Blue Feather",weight:20,value:10},{name:"Green Feather",weight:20,value:10},{name:"Orange Feather",weight:20,value:10},{name:"Purple Feather",weight:20,value:18}] },
  boar:    { id:"boar",    name:"Charging Boar",   art:["  C====3  "," (@oo@)  ","  mm  mm "],  color:"#92400e", maxHp:90,  atk:25, def:9,  xp:110, weight:1,
    loot:[{name:"Boar Hide",weight:50,value:40},{name:"Boar Bones",weight:20,value:20},{name:"Crown of Tusks",weight:2,value:90},{name:"nothing",weight:28}] },
  noble:   { id:"noble",   name:"Fighting Noble",  art:["  [≡≡≡]  "," (⌐■_■)  ","  /| |\\  "],  color:"#fbbf24", maxHp:70,  atk:22, def:11, xp:130, weight:1,
    loot:[{name:"Sack of Coin",weight:50,value:0},{name:"Large Sack of Coin",weight:20,value:0},{name:"Merchant Seal",weight:2,value:0},{name:"nothing",weight:28}] },
};

// ── MOUNTAIN ENEMIES ─────────────────────────────────────
const MOUNTAIN_ENEMIES = {
  cultist: { id:"cultist",  name:"Insane Cultist",    art:["  ☽☽☽☽☽  "," (⊙_⊙)   ","  /|Δ|\\  "],  color:"#a78bfa", maxHp:140, atk:42, def:16, xp:200, weight:24,
    loot:[{name:"Large Sack of Coin",weight:50,value:0},{name:"Viridian Ash",weight:20,value:35},{name:"Churchyard Map",weight:2,value:0},{name:"nothing",weight:28}] },
  monk:    { id:"monk",     name:"Vicious Monk",       art:["  _____  "," (>●<)   ","  |===|  "],   color:"#f472b6", maxHp:120, atk:48, def:20, xp:220, weight:24,
    loot:[{name:"Velvet Robe",weight:50,value:45},{name:"Recipe for Shadowfang ★",weight:20,value:0},{name:"Book: Solid Strikes V1",weight:2,value:0,unique:true,uniqueFlag:"solidStrikesDropped"},{name:"nothing",weight:28}] },
  goat:    { id:"goat",     name:"Mountain Goat",      art:["  /\\ /\\  "," (^.^)   ","  Y| |Y  "],   color:"#d1fae5", maxHp:160, atk:38, def:24, xp:180, weight:24,
    loot:[{name:"Goat Horns",weight:50,value:28},{name:"Warm Milk",weight:20,value:0},{name:"Treasure Key",weight:2,value:0},{name:"nothing",weight:28}] },
  ogre:    { id:"ogre",     name:"Cruel Ogre",         art:["  ╔═══╗  ","  ║OWO║  ","  ╚═══╝  "],   color:"#6b7280", maxHp:200, atk:55, def:14, xp:280, weight:24,
    loot:[{name:"Ogre Bones",weight:50,value:30},{name:"Ogre Blood",weight:20,value:50},{name:"Talent Chit",weight:2,value:0},{name:"nothing",weight:28}] },
  merchant:{ id:"merchant", name:"Travelling Merchant", art:["  [~~~~]  "," (^‿^)   ","  |___|  "],   color:"#fbbf24", special:"merchant", weight:1 },
  shronk:  { id:"shronk",   name:"Shronk",             art:["  ~∿~~~  "," (ò_óˇ)  ","  /|▄|\\  "],   color:"#4ade80", maxHp:350, atk:50, def:20, xp:450, weight:1,
    loot:[{name:"Donkey Bones",weight:50,value:22},{name:"Onion",weight:20,value:15},{name:"Swamp Map",weight:2,value:0},{name:"nothing",weight:28}] },
  baal:    { id:"baal",     name:"Baal",               art:["   ψ   ψ  "," (҉_҉)   ","  \\|||/  "],   color:"#f87171", maxHp:500, atk:65, def:28, xp:650, weight:1,
    loot:[{name:"Demon Bones",weight:50,value:60},{name:"Trihorn",weight:20,value:80},{name:"Spiritworld Map",weight:2,value:0},{name:"nothing",weight:28}] },
  priest:  { id:"priest",   name:"Calm Priest",        art:["   †   †  "," (^ω^)   ","   |   |  "],   color:"#bfdbfe", special:"priest", weight:1 },
};

// ── LEVEL SYSTEM ──────────────────────────────────────────
const XP_CURVE  = [0,0,70,170,320,530,810,1170,1620,2170,2840,3650,4620,5760,7080,8600];
const ABS_MAX   = 15;
const getLevel  = (xp,maxLvl=10)=>{ for(let i=maxLvl;i>=1;i--) if(xp>=XP_CURVE[i]) return i; return 1; };
const xpForNext = (lvl,maxLvl=10)=>lvl>=maxLvl?XP_CURVE[maxLvl]:XP_CURVE[lvl+1];

const calcStats = (lvl, equipment=DEFAULT_EQUIP) => {
  const base={maxHp:35+lvl*12, atk:7+lvl*2, def:2+lvl};
  for(const g of Object.values(equipment).filter(Boolean)){
    if(g.atk) base.atk+=g.atk;
    if(g.def) base.def+=g.def;
    if(g.hp)  base.maxHp+=g.hp;
  }
  return base;
};

const spawnForest   = ()=>_spawn(FOREST_ENEMIES);
const spawnMountain = ()=>_spawn(MOUNTAIN_ENEMIES);
const _spawn = (pool)=>{
  const arr=Object.values(pool);
  const total=arr.reduce((s,e)=>s+e.weight,0);
  let r=Math.random()*total;
  for(const e of arr){ r-=e.weight; if(r<=0) return {...e,hp:e.maxHp??1}; }
  return {...arr[0],hp:arr[0].maxHp??1};
};

const mkPlayer = (name)=>{
  const s=calcStats(1,DEFAULT_EQUIP);
  return {
    name, xp:0, gold:10, inventory:[], hp:s.maxHp,
    equipment:{...DEFAULT_EQUIP},
    critChance:0, holyExpiry:0, maxLevel:10,
    flatAtk:0, flatDef:0, fleeBonus:0,
    flags:{
      solidStrikesDropped:false, expandedMindLearned:false,
      ironWillLearned:false, battleHymnLearned:false, swiftFeetLearned:false,
    },
  };
};

const groupInventory = (inv)=>Object.values(inv.reduce((acc,item)=>{
  if(!acc[item.name]) acc[item.name]={name:item.name,value:item.value,count:0};
  acc[item.name].count++; return acc;
},{}));

// ── MERCHANT POOL ─────────────────────────────────────────
const buildMerchantPool = (player) => {
  const pool = [];
  const wId = player.equipment.weapon?.id;
  const aId = player.equipment.armour?.id;
  const rId = player.equipment.ring?.id;
  const eId = player.equipment.earring?.id;

  // Recipes (only if player might benefit)
  if(!["shadowfang","shadowfang_plus","shadowfang_plus_alt"].includes(wId))
    pool.push({id:"r_sf",  name:"Recipe: Shadowfang",   cost:200, type:"recipe", desc:"Forge Shadowfang · Forest Blade + 3 Fox Pelts"});
  if(!["shadow","warlords_cloak"].includes(aId))
    pool.push({id:"r_sc",  name:"Recipe: Shadow Cloak", cost:200, type:"recipe", desc:"Forge Shadow Cloak · Iron Plate + 2 Boar Hides"});
  if(!["kings_seal","amethyst_seal"].includes(rId))
    pool.push({id:"r_ks",  name:"Recipe: King's Seal",  cost:180, type:"recipe", desc:"Forge King's Seal · Defender's Band + Crown of Tusks"});
  if(!["void_shard","void_shard_plus"].includes(eId))
    pool.push({id:"r_vs",  name:"Recipe: Void Shard",   cost:180, type:"recipe", desc:"Forge Void Shard · Moonstone Drop + Silver Earring"});

  // Key items
  if(!player.inventory.some(i=>i.name==="Treasure Key"))
    pool.push({id:"tkey", name:"Treasure Key", cost:200, type:"key", desc:"Opens treasure chests in the wild"});

  // Heal items
  pool.push({id:"ale",  name:"Warm Ale",  cost:55, type:"usable", desc:"Heals 15–25 HP · Free action in combat"});
  pool.push({id:"milk", name:"Warm Milk", cost:90, type:"usable", desc:"Heals 30–45 HP · Free action in combat"});

  // Books
  if(!player.flags.solidStrikesDropped)
    pool.push({id:"b_ss", name:"Book: Solid Strikes V1", cost:500, type:"book", desc:"+1% crit · Double damage on crits"});
  if(!player.flags.ironWillLearned)
    pool.push({id:"b_iw", name:"Book: Iron Will",    cost:400, type:"book", desc:"Permanently +5 DEF"});
  if(!player.flags.battleHymnLearned)
    pool.push({id:"b_bh", name:"Book: Battle Hymn",  cost:400, type:"book", desc:"Permanently +5 ATK"});
  if(!player.flags.swiftFeetLearned)
    pool.push({id:"b_sf", name:"Book: Swift Feet",   cost:300, type:"book", desc:"+15% flee success rate"});

  // Stronger gear (only if player has something weaker)
  const wTier=["stick","dagger","sword","blade","shadowfang","shadowfang_plus","shadowfang_plus_alt"].indexOf(wId??"stick");
  const aTier=["rags","leather","chain","plate","shadow","warlords_cloak"].indexOf(aId??"rags");
  const rTier=[null,"copper_ring","jade_band","blood_ring","defender_band","kings_seal","amethyst_seal"].indexOf(rId??null);
  const eTier=[null,"bone_hook","silver_drop","hunters","moonstone","void_shard","void_shard_plus"].indexOf(eId??null);
  if(wTier>=0&&wTier<4) pool.push({id:"g_sf", name:"Shadowfang",   cost:450, type:"gear", item:SHOP.weapons[4], desc:"+28 ATK"});
  if(aTier>=0&&aTier<4) pool.push({id:"g_sc", name:"Shadow Cloak", cost:550, type:"gear", item:SHOP.armour[4],  desc:"+16 DEF · +65 HP"});
  if(rTier <4)          pool.push({id:"g_ks", name:"King's Seal",  cost:500, type:"gear", item:SHOP.rings[4],   desc:"+5 ATK · +4 DEF · +20 HP"});
  if(eTier <4)          pool.push({id:"g_vs", name:"Void Shard",   cost:580, type:"gear", item:SHOP.earrings[4],desc:"+8 ATK · +3 DEF · +15 HP"});

  return pool;
};

const genOffer = (player)=>{
  const pool=buildMerchantPool(player);
  if(!pool.length) return null;
  return pool[Math.floor(Math.random()*pool.length)];
};

// ── SHARED UI ─────────────────────────────────────────────
const HpBar=({current,max,color=T.green})=>{
  const pct=Math.max(0,Math.min(100,(current/max)*100));
  const bc=pct>50?color:pct>25?T.amber:T.red;
  return <div style={{width:"100%",background:"#0a1a0d",borderRadius:2,height:8}}><div style={{width:`${pct}%`,background:bc,height:"100%",borderRadius:2,transition:"width 0.4s ease"}}/></div>;
};
const XpBar=({xp,level,maxLevel=10})=>{
  if(level>=maxLevel) return <div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"0.85rem"}}>— MAX LEVEL —</div>;
  const pct=((xp-XP_CURVE[level])/(xpForNext(level,maxLevel)-XP_CURVE[level]))*100;
  return <div style={{width:"100%",background:"#0a1a0d",borderRadius:2,height:6}}><div style={{width:`${pct}%`,background:T.gold,height:"100%",borderRadius:2,transition:"width 0.5s ease"}}/></div>;
};
const Panel=({children,style={}})=>(
  <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4,padding:14,...style}}>{children}</div>
);
const Btn=({children,onClick,disabled,variant="default",style={}})=>{
  const vs={
    default:{bg:"#0f2215",color:T.text,  border:T.border},
    primary:{bg:"#0f2e16",color:T.green, border:T.green },
    danger: {bg:"#2e0f0f",color:T.red,   border:T.red   },
    gold:   {bg:"#2e1f00",color:T.gold,  border:T.gold  },
    purple: {bg:"#1e0f2e",color:T.purple,border:T.purple},
    amber:  {bg:"#2e1a00",color:T.amber, border:T.amber },
    steel:  {bg:"#111827",color:T.steel, border:T.steel },
    blue:   {bg:"#0f1e2e",color:T.blue,  border:T.blue  },
    dim:    {bg:"#0a150d",color:T.dim,   border:T.border},
  };
  const v=vs[variant]||vs.default;
  const [hv,setHv]=useState(false);
  return(
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={()=>setHv(true)} onMouseLeave={()=>setHv(false)}
      style={{background:hv&&!disabled?v.bg+"ee":v.bg,color:v.color,border:`1px solid ${v.border}`,
        fontFamily:"'VT323',monospace",fontSize:"1.05rem",padding:"8px 14px",borderRadius:3,
        cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.45:1,transition:"all 0.15s",
        letterSpacing:"0.04em",transform:hv&&!disabled?"translateY(-1px)":"none",...style}}>
      {children}
    </button>
  );
};
const Tab=({label,active,onClick})=>(
  <button onClick={onClick} style={{flex:1,fontFamily:"'VT323',monospace",fontSize:"0.88rem",
    padding:"7px 4px",borderRadius:"3px 3px 0 0",cursor:"pointer",
    background:active?T.panel:"#070f09",color:active?T.green:T.dim,
    border:`1px solid ${active?T.borderBright:T.border}`,
    borderBottom:active?`1px solid ${T.panel}`:`1px solid ${T.border}`,
    letterSpacing:"0.05em",transition:"all 0.15s"}}>
    {label}
  </button>
);
const Divider=({label})=>(
  <div style={{display:"flex",alignItems:"center",gap:8,margin:"12px 0"}}>
    <div style={{flex:1,height:1,background:T.border}}/>
    {label&&<span style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>{label}</span>}
    <div style={{flex:1,height:1,background:T.border}}/>
  </div>
);
const CombatLog=({lines})=>{
  const ref=useRef(null);
  useEffect(()=>{if(ref.current) ref.current.scrollTop=ref.current.scrollHeight;},[lines]);
  const col=(l)=>{
    if(l.includes("⚔")||l.includes("strike")) return T.amber;
    if(l.includes("CRIT")) return T.gold;
    if(l.includes("💀")||l.includes("unconscious")||l.includes("retaliates")||l.includes("attacks for")||l.includes("Hit for")) return T.red;
    if(l.includes("✨")||l.includes("XP")||l.includes("📦")) return T.green;
    if(l.includes("🌟")||l.includes("LEVEL UP")) return T.gold;
    if(l.includes("🏃")||l.includes("dash")||l.includes("escape")) return T.blue;
    if(l.includes("🍺")||l.includes("🥛")) return T.amber;
    if(l.includes("✦")||l.includes("misses")||l.includes("holy")) return T.purple;
    return T.text;
  };
  return(
    <div ref={ref} style={{background:"#030a05",border:`1px solid ${T.border}`,borderRadius:3,
      padding:"10px 12px",height:130,overflowY:"auto",fontFamily:"'VT323',monospace",fontSize:"0.95rem",lineHeight:1.65}}>
      {lines.map((l,i)=><div key={i} style={{color:col(l)}}>{l}</div>)}
    </div>
  );
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
    <div style={{display:"flex",gap:12,marginTop:6,flexWrap:"wrap"}}>
      {hasHeaddress(player)&&<span style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.75rem"}}>✦ Headdress</span>}
      {player.critChance>0&&<span style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"0.75rem"}}>⚡ {Math.round(player.critChance*100)}% Crit</span>}
      {hasHoly(player)&&<span style={{color:T.blue,fontFamily:"'VT323',monospace",fontSize:"0.75rem"}}>☩ Holy +10</span>}
    </div>
  </Panel>
);

// ── SCREEN: TITLE ─────────────────────────────────────────
const TitleScreen=({onStart})=>(
  <div style={{textAlign:"center",padding:"28px 20px 24px"}}>
    <div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"clamp(2.2rem,11vw,3rem)",
      letterSpacing:"0.12em",lineHeight:1,marginBottom:2,textShadow:"0 0 30px rgba(212,168,67,0.45)"}}>
      BYZANTIUM
    </div>
    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",letterSpacing:"0.22em",marginBottom:20}}>
      ── TALES OF THE FOREST ──
    </div>
    <pre style={{color:T.greenDim,fontFamily:"monospace",fontSize:"0.95rem",lineHeight:1.5,marginBottom:24,display:"inline-block",textAlign:"left"}}>
{`🌲 🌲  🌲 🌲 🌲 🌲
 🌿   🌿  🌿  🌿
🌲 🌿 🌿 🌿 🌿 🌲
🌲🌲🌲🌲🌲🌲🌲🌲`}
    </pre>
    <div style={{marginBottom:14}}>
      <Btn onClick={onStart} variant="primary" style={{fontSize:"1.3rem",padding:"12px 40px",width:"100%"}}>▶  BEGIN ADVENTURE</Btn>
    </div>
    <div style={{background:"#070f09",border:`1px solid ${T.border}`,borderRadius:4,padding:"10px 14px",textAlign:"left",marginBottom:8}}>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.75rem",marginBottom:6,letterSpacing:"0.1em"}}>ZONE I · THE FOREST</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"4px 12px"}}>
        {Object.values(FOREST_ENEMIES).map(e=><span key={e.id} style={{color:e.color,fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>{e.name}</span>)}
      </div>
    </div>
    <div style={{background:"#070f09",border:"1px solid #1a2a3a",borderRadius:4,padding:"10px 14px",textAlign:"left"}}>
      <div style={{color:"#2a4a6a",fontFamily:"'VT323',monospace",fontSize:"0.75rem",marginBottom:4,letterSpacing:"0.1em"}}>ZONE II · THE MOUNTAIN  <span style={{color:"#1a2a3a"}}>[Lv10 · Map required]</span></div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"4px 12px"}}>
        {Object.values(MOUNTAIN_ENEMIES).map(e=><span key={e.id} style={{color:"#1a3050",fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>{e.name}</span>)}
      </div>
    </div>
    <div style={{color:"#1a3320",fontFamily:"'VT323',monospace",fontSize:"0.72rem",marginTop:14}}>v2.1 · Hunt · Loot · Conquer</div>
  </div>
);

// ── SCREEN: NAME ──────────────────────────────────────────
const NameScreen=({onConfirm})=>{
  const [name,setName]=useState(""); const clean=name.trim(); const ss=calcStats(1,DEFAULT_EQUIP);
  return(
    <div style={{padding:"24px 20px"}}>
      <div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"1.4rem",textAlign:"center",marginBottom:2}}>WHO ARE YOU, TRAVELLER?</div>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.88rem",textAlign:"center",marginBottom:20}}>The empire remembers all who enter...</div>
      <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&clean&&onConfirm(clean)}
        placeholder="Enter your name..." maxLength={18} autoFocus
        style={{background:T.panel,border:`1px solid ${clean?T.green:T.border}`,color:T.green,
          fontFamily:"'VT323',monospace",fontSize:"1.3rem",padding:"10px 16px",borderRadius:3,
          width:"100%",outline:"none",textAlign:"center",transition:"border-color 0.2s",
          boxSizing:"border-box",marginBottom:16}}/>
      <Panel style={{marginBottom:16}}>
        <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.82rem",marginBottom:10,textAlign:"center"}}>── STARTING CHARACTER ──</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          {[["❤ HP",ss.maxHp],["⚔ ATK",ss.atk],["🛡 DEF",ss.def]].map(([l,v])=>(
            <div key={l} style={{background:"#060e08",border:`1px solid ${T.border}`,borderRadius:3,padding:"8px 4px",textAlign:"center"}}>
              <div style={{color:T.dim,  fontFamily:"'VT323',monospace",fontSize:"0.72rem"}}>{l}</div>
              <div style={{color:T.white,fontFamily:"'VT323',monospace",fontSize:"1.2rem" }}>{v}</div>
            </div>
          ))}
        </div>
        <Divider/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 10px"}}>
          {[["⚔ Weapon",SHOP.weapons[0].name],["🛡 Armour",SHOP.armour[0].name],["💍 Ring","None"],["💎 Earring","None"],["💰 Gold","10g"],["★ Level","1"]].map(([l,v])=>(
            <div key={l} style={{fontFamily:"'VT323',monospace",fontSize:"0.82rem"}}>
              <span style={{color:T.dim}}>{l}: </span><span style={{color:T.text}}>{v}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Btn onClick={()=>clean&&onConfirm(clean)} variant="primary" disabled={!clean} style={{fontSize:"1.15rem",padding:"11px 28px",width:"100%"}}>ENTER THE WORLD →</Btn>
    </div>
  );
};

// ── SCREEN: TOWN ──────────────────────────────────────────
const TownScreen=({player,level,stats,onForest,onShop,onStats,onRest,onMountain})=>{
  const atMax=player.hp>=stats.maxHp; const mapOwned=hasMap(player);
  return(
    <div style={{padding:16}}>
      <div style={{fontFamily:"'VT323',monospace",color:T.gold,fontSize:"1.3rem"}}>⌂  SYLVANTIDE VILLAGE</div>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:14}}>A quiet hamlet on the empire's edge</div>
      <PlayerPanel player={player} level={level} stats={stats}/>
      <Panel style={{marginBottom:14,textAlign:"center",padding:"10px 14px"}}>
        <pre style={{color:T.dim,fontFamily:"monospace",fontSize:"0.68rem",lineHeight:1.5,margin:0}}>{
`  🌲 🌲  [SHOP]  🌲 🌲 🌲
  🌲  🌿  ─────  🌿  🌲
   🌲   🌿    🌿   🌲  🌲
  ━━━━━━━━━━━━━━━━━━━━━━`}</pre>
        <div style={{color:T.text,fontFamily:"'VT323',monospace",fontSize:"0.9rem",marginTop:8}}>The Forest looms darkly to the north...</div>
      </Panel>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Btn onClick={onForest} variant="primary" style={{padding:12,fontSize:"1rem"}}>🌲 Enter Forest</Btn>
        <Btn onClick={onShop}   variant="gold"    style={{padding:12,fontSize:"1rem"}}>🏪 Merchant</Btn>
        <Btn onClick={onStats}                    style={{padding:12,fontSize:"1rem"}}>📜 Stats</Btn>
        <Btn onClick={onRest} disabled={atMax} variant={atMax?"dim":"default"} style={{padding:12,fontSize:"1rem"}}>🛏 Rest {atMax?"(Full)":"(Free)"}</Btn>
        <Btn onClick={mapOwned?onMountain:null} disabled={!mapOwned} variant={mapOwned?"steel":"dim"} style={{padding:12,fontSize:"1rem",gridColumn:"1 / -1"}}>
          ⛰ {mapOwned?"Enter The Mountain":"Enter The Mountain  (Mountain Map required)"}
        </Btn>
      </div>
      {player.inventory.length>0&&(
        <div style={{marginTop:12,padding:"8px 12px",background:"#1f1500",border:`1px solid ${T.gold}`,borderRadius:3,color:T.gold,fontFamily:"'VT323',monospace",fontSize:"0.9rem",textAlign:"center"}}>
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
      <Panel style={{marginBottom:14,textAlign:"center",padding:"10px 14px"}}>
        <pre style={{color:"#1a3050",fontFamily:"monospace",fontSize:"0.72rem",lineHeight:1.5,margin:0}}>{
`       /\\   /\\
      /  \\ /  \\
     / ⛺ V ⛺ \\
    /  [FORGE]  \\
   /______________\\`}</pre>
        <div style={{color:T.steel,fontFamily:"'VT323',monospace",fontSize:"0.88rem",marginTop:8}}>The blacksmith's hammer rings in the pass...</div>
        {hasHoly(player)&&<div style={{color:T.blue,fontFamily:"'VT323',monospace",fontSize:"0.78rem",marginTop:4}}>☩ Holy damage active (+10/swing)</div>}
      </Panel>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Btn onClick={onHunt}        variant="primary" style={{padding:12,fontSize:"1rem"}}>⚔ Hunt Mountain</Btn>
        <Btn onClick={onBlacksmith}  variant="steel"   style={{padding:12,fontSize:"1rem"}}>🔨 Blacksmith</Btn>
        <Btn onClick={onStats}                         style={{padding:12,fontSize:"1rem"}}>📜 Stats</Btn>
        <Btn onClick={onRest} disabled={atMax} variant={atMax?"dim":"default"} style={{padding:12,fontSize:"1rem"}}>🛏 Rest {atMax?"(Full)":"(Free)"}</Btn>
        <Btn onClick={onReturn} style={{padding:12,fontSize:"1rem",gridColumn:"1 / -1"}}>← Return to Sylvantide</Btn>
      </div>
    </div>
  );
};

// ── SCREEN: COMBAT ────────────────────────────────────────
const CombatScreen=({player,stats,enemy,log,phase,onAttack,onFlee,onReturn,onHuntAgain,onUseItem})=>{
  const [showItems,setShowItems]=useState(false);
  const ales  = player.inventory.filter(i=>i.name==="Warm Ale");
  const milks = player.inventory.filter(i=>i.name==="Warm Milk");
  const totalHeal = ales.length+milks.length;
  return(
    <div style={{padding:16}}>
      <div style={{color:T.red,fontFamily:"'VT323',monospace",fontSize:"1.2rem",marginBottom:10}}>⚔  COMBAT — {enemy.name.toUpperCase()}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <Panel style={{padding:10}}>
          <div style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{player.name}</div>
          <div style={{color:T.dim,  fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>HP {player.hp}/{stats.maxHp}</div>
          <HpBar current={player.hp} max={stats.maxHp}/>
          <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
            {hasHeaddress(player)&&<span style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.65rem"}}>✦ Evade</span>}
            {player.critChance>0&&<span style={{color:T.gold,  fontFamily:"'VT323',monospace",fontSize:"0.65rem"}}>⚡ Crit</span>}
            {hasHoly(player)&&     <span style={{color:T.blue,  fontFamily:"'VT323',monospace",fontSize:"0.65rem"}}>☩ Holy</span>}
          </div>
        </Panel>
        <Panel style={{padding:10}}>
          <div style={{color:enemy.color,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{enemy.name}</div>
          <div style={{color:T.dim,      fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>HP {enemy.hp}/{enemy.maxHp}</div>
          <HpBar current={enemy.hp} max={enemy.maxHp} color={T.red}/>
        </Panel>
      </div>
      <Panel style={{textAlign:"center",marginBottom:10,padding:"12px 10px"}}>
        <pre style={{color:enemy.hp>0?enemy.color:T.dim,fontFamily:"monospace",fontSize:"1.15rem",lineHeight:1.5,margin:0,opacity:enemy.hp<=0?0.3:1,transition:"opacity 0.4s"}}>
          {enemy.art.join("\n")}
        </pre>
        {enemy.hp<=0&&<div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginTop:4}}>✝  DEFEATED</div>}
      </Panel>
      <CombatLog lines={log}/>
      {showItems&&phase==="player_turn"&&(
        <Panel style={{marginTop:8,padding:10}}>
          <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:8}}>USE ITEM  <span style={{color:T.dim,fontSize:"0.72rem"}}>(free action)</span></div>
          {totalHeal===0?(
            <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem"}}>No usable items.</div>
          ):(
            <>
              {ales.length>0&&(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div>
                    <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.9rem"}}>🍺 Warm Ale <span style={{color:T.dim}}>×{ales.length}</span></div>
                    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.72rem"}}>Heals 15–25 HP</div>
                  </div>
                  <Btn onClick={()=>{onUseItem("Warm Ale");setShowItems(false);}} variant="amber" style={{padding:"4px 10px",fontSize:"0.85rem"}}>Drink</Btn>
                </div>
              )}
              {milks.length>0&&(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:T.blue,fontFamily:"'VT323',monospace",fontSize:"0.9rem"}}>🥛 Warm Milk <span style={{color:T.dim}}>×{milks.length}</span></div>
                    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.72rem"}}>Heals 30–45 HP</div>
                  </div>
                  <Btn onClick={()=>{onUseItem("Warm Milk");setShowItems(false);}} variant="blue" style={{padding:"4px 10px",fontSize:"0.85rem"}}>Drink</Btn>
                </div>
              )}
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
        {(phase==="defeat"||phase==="fled")&&(
          <Btn onClick={onReturn} variant="gold" style={{flex:1,fontSize:"1.05rem"}}>
            {phase==="defeat"?"💀 Retreat to Village":"⌂ Return to Village"}
          </Btn>
        )}
      </div>
    </div>
  );
};

// ── SCREEN: MERCHANT ENCOUNTER ────────────────────────────
const MerchantEncounterScreen=({player,stats,offer,onBuy,onLeave})=>(
  <div style={{padding:16}}>
    <div style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"1.2rem",marginBottom:6}}>🏕 TRAVELLING MERCHANT</div>
    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:16}}>"Step right up! One item, one price. Take it or leave it."</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
      <Panel style={{padding:10}}>
        <div style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{player.name}</div>
        <div style={{color:T.dim,  fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>HP {player.hp}/{stats.maxHp}</div>
        <HpBar current={player.hp} max={stats.maxHp}/>
      </Panel>
      <Panel style={{padding:10,textAlign:"center"}}>
        <pre style={{color:T.gold,fontFamily:"monospace",fontSize:"1.1rem",lineHeight:1.5,margin:0}}>
{`  [~~~~]
 (^‿^)
  |___|`}
        </pre>
      </Panel>
    </div>
    {offer?(
      <Panel style={{marginBottom:14,border:`1px solid ${T.gold}`}}>
        <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.8rem",marginBottom:8,letterSpacing:"0.1em"}}>TODAY'S OFFER</div>
        <div style={{color:T.white,fontFamily:"'VT323',monospace",fontSize:"1.1rem"}}>{offer.name}</div>
        <div style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.82rem",marginBottom:8}}>{offer.desc}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:player.gold>=offer.cost?T.gold:T.red,fontFamily:"'VT323',monospace",fontSize:"1.1rem"}}>{offer.cost}g</span>
          <span style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>You have: {player.gold}g</span>
        </div>
        <Btn onClick={()=>player.gold>=offer.cost&&onBuy(offer)} disabled={player.gold<offer.cost} variant="gold" style={{width:"100%",marginTop:10,fontSize:"1.05rem",padding:10}}>
          {player.gold>=offer.cost?"Buy":"Not enough gold"}
        </Btn>
      </Panel>
    ):(
      <Panel style={{marginBottom:14,textAlign:"center",padding:"20px 14px"}}>
        <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.9rem"}}>"I'm fresh out of things you'd want."</div>
      </Panel>
    )}
    <Btn onClick={onLeave} style={{width:"100%"}}>← Continue Journey</Btn>
  </div>
);

// ── SCREEN: PRIEST ENCOUNTER ──────────────────────────────
const PriestEncounterScreen=({player,stats,onDonate,onLeave})=>{
  const canAfford=player.gold>=500;
  const hasBook=player.flags.expandedMindLearned;
  return(
    <div style={{padding:16}}>
      <div style={{color:T.blue,fontFamily:"'VT323',monospace",fontSize:"1.2rem",marginBottom:6}}>☩ CALM PRIEST</div>
      <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.85rem",marginBottom:16}}>He sits peacefully by a small stone altar.</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <Panel style={{padding:10}}>
          <div style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{player.name}</div>
          <div style={{color:T.dim,  fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>HP {player.hp}/{stats.maxHp}</div>
          <HpBar current={player.hp} max={stats.maxHp}/>
        </Panel>
        <Panel style={{padding:10,textAlign:"center"}}>
          <pre style={{color:T.blue,fontFamily:"monospace",fontSize:"1.1rem",lineHeight:1.5,margin:0}}>
{`  †   †
 (^ω^)
  |   |`}
          </pre>
        </Panel>
      </div>
      <Panel style={{marginBottom:14}}>
        <div style={{color:T.text,fontFamily:"'VT323',monospace",fontSize:"0.9rem",marginBottom:10,lineHeight:1.6}}>
          {!hasBook
            ? `"The mountain is unkind to the unprepared. A donation of 500 gold brings the light of wisdom — and it may yet raise your limits."`
            : `"Bless you, child. A further donation grants holy fury for five minutes. The next five minutes of battle, your strikes carry divine weight."`}
        </div>
        <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem",marginBottom:10}}>
          {!hasBook?"Reward: Book: Expansive Mind (level cap 10 → 15)":"Reward: +10 holy damage per swing for 5 minutes"}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{color:canAfford?T.gold:T.red,fontFamily:"'VT323',monospace",fontSize:"1.1rem"}}>500g</span>
          <span style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>You have: {player.gold}g</span>
        </div>
        <Btn onClick={canAfford?onDonate:null} disabled={!canAfford} variant="blue" style={{width:"100%",fontSize:"1.05rem",padding:10}}>
          {canAfford?"Make Donation":"Not enough gold"}
        </Btn>
      </Panel>
      <Btn onClick={onLeave} style={{width:"100%"}}>← Continue Journey</Btn>
    </div>
  );
};

// ── SCREEN: SHOP ──────────────────────────────────────────
const SLOT_LABELS={weapon:"⚔ Weapon",armour:"🛡 Armour",ring:"💍 Ring",earring:"💎 Earring"};
const SLOT_ICONS ={weapon:"⚔",       armour:"🛡",        ring:"💍",    earring:"💎"};

const ShopScreen=({player,level,onSell,onSellAll,onBuy,onOpenSack,onReadBook,onBuyMap,onBack})=>{
  const [tab,setTab]=useState("sell"); const [buyTab,setBuyTab]=useState("weapons");
  const lootItems   =groupInventory(player.inventory.filter(i=>isSellable(i.name)));
  const specialItems=groupInventory(player.inventory.filter(i=>!isSellable(i.name)));
  const lootTotal   =lootItems.reduce((s,i)=>s+sellValue(player,i.value)*i.count,0);
  const sealActive  =hasSeal(player); const mapOwned=hasMap(player);
  const isEquipped  =(item)=>player.equipment[item.slot]?.id===item.id;
  const canAfford   =(item)=>player.gold>=item.cost;
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
        {tab==="sell"&&(
          lootItems.length===0?(
            <div style={{color:T.dim,fontFamily:"'VT323',monospace",textAlign:"center",padding:"20px 0"}}>Nothing to sell — hunt some creatures!</div>
          ):(
            <>
              {lootItems.map(item=>{const sv=sellValue(player,item.value); return(
                <div key={item.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                  <div>
                    <div style={{color:T.text,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{item.name} <span style={{color:T.dim}}>×{item.count}</span></div>
                    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>{sv}g each</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{color:T.gold,fontFamily:"'VT323',monospace"}}>{sv*item.count}g</span>
                    <Btn onClick={()=>onSell(item.name)} variant="gold" style={{padding:"4px 10px",fontSize:"0.85rem"}}>Sell</Btn>
                  </div>
                </div>
              );})}
              <div style={{marginTop:12}}><Btn onClick={onSellAll} variant="gold" style={{width:"100%",fontSize:"1.05rem",padding:10}}>✦  Sell All  ({lootTotal}g)</Btn></div>
            </>
          )
        )}
        {tab==="buy"&&(
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:4,marginBottom:12}}>
              {Object.keys(SHOP).map(cat=>(
                <button key={cat} onClick={()=>setBuyTab(cat)} style={{
                  background:buyTab===cat?"#1a3d20":"#0a150d",color:buyTab===cat?T.green:T.dim,
                  border:`1px solid ${buyTab===cat?T.green:T.border}`,fontFamily:"'VT323',monospace",
                  fontSize:"0.8rem",padding:"5px 2px",borderRadius:3,cursor:"pointer",textTransform:"capitalize"}}>
                  {SLOT_ICONS[cat.replace(/s$/,"")]}  {cat.charAt(0).toUpperCase()+cat.slice(1)}
                </button>
              ))}
            </div>
            {(()=>{const slot=buyTab.replace(/s$/,""); const eq=player.equipment[slot];
              return eq?(
                <div style={{marginBottom:10,padding:"6px 10px",background:"#0a1f0d",border:`1px solid ${T.greenDim}`,borderRadius:3}}>
                  <span style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>Equipped: </span>
                  <span style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"0.9rem"}}>{eq.name}  <span style={{color:T.dim}}>{statLabel(eq)}</span></span>
                </div>
              ):<div style={{marginBottom:10,color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>No {slot} equipped</div>;
            })()}
            {SHOP[buyTab].map(item=>{const eq=isEquipped(item); const af=canAfford(item); return(
              <div key={item.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.border}`,opacity:!af&&!eq?0.5:1}}>
                <div>
                  <div style={{color:eq?T.green:T.text,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>{eq&&"✓ "}{item.name}</div>
                  <div style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.8rem"}}>{statLabel(item)}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {item.cost>0&&<span style={{color:af?T.gold:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.9rem"}}>{item.cost}g</span>}
                  <Btn onClick={()=>!eq&&onBuy(item)} disabled={eq||(!af&&item.cost>0)} variant={eq?"dim":"gold"} style={{padding:"4px 8px",fontSize:"0.82rem"}}>
                    {eq?"Worn":item.cost===0?"Free":"Buy"}
                  </Btn>
                </div>
              </div>
            );})}
          </>
        )}
        {tab==="items"&&(
          <>
            {specialItems.map(item=>{
              const sp=SPECIAL[item.name]; const type=sp?.type;
              return(
                <div key={item.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
                  <div>
                    <div style={{color:type==="key"?T.gold:type==="book"?T.blue:type==="recipe"?T.purple:type==="usable"?T.amber:T.blue,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>
                      {type==="key"?"🔖 ":type==="book"?"📖 ":type==="recipe"?"📜 ":type==="usable"?"🍺 ":"💰 "}
                      {item.name}{item.count>1&&<span style={{color:T.dim}}> ×{item.count}</span>}
                    </div>
                    <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.75rem"}}>
                      {type==="key"&&sp?.desc}
                      {type==="book"&&sp?.desc}
                      {type==="recipe"&&sp?.desc}
                      {type==="usable"&&`Heals ${sp?.healMin}–${sp?.healMax} HP · Free action in combat`}
                      {type==="openable"&&`Contains ${sp?.goldMin}–${sp?.goldMax}g`}
                    </div>
                  </div>
                  {type==="openable"&&<Btn onClick={()=>onOpenSack(item.name)} variant="gold" style={{padding:"4px 10px",fontSize:"0.85rem"}}>Open</Btn>}
                  {type==="book"&&<Btn onClick={()=>onReadBook(item.name)} variant="blue" style={{padding:"4px 10px",fontSize:"0.85rem"}}>Read</Btn>}
                  {type==="key"&&<span style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>ACTIVE</span>}
                  {type==="usable"&&<span style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.75rem"}}>Combat only</span>}
                  {type==="recipe"&&<span style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.75rem"}}>Blacksmith</span>}
                </div>
              );
            })}
            {specialItems.length===0&&level<10&&(
              <div style={{color:T.dim,fontFamily:"'VT323',monospace",textAlign:"center",padding:"20px 0"}}>No special items in your bag.</div>
            )}
            {level>=10&&!mapOwned&&(
              <>
                <Divider label="RARE MAPS"/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0"}}>
                  <div>
                    <div style={{color:T.steel,fontFamily:"'VT323',monospace",fontSize:"0.95rem"}}>🗺  Mountain Map</div>
                    <div style={{color:T.dim,  fontFamily:"'VT323',monospace",fontSize:"0.75rem"}}>Unlocks The Mountain zone</div>
                  </div>
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
      {visible.map(recipe=>{
        const already=recipe.alreadyHave(player); const can=!already&&recipe.canCraft(player);
        return(
          <Panel key={recipe.id} style={{marginBottom:10,border:`1px solid ${already?T.greenDim:can?T.amber:T.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{color:already?T.green:can?T.amber:T.text,fontFamily:"'VT323',monospace",fontSize:"1.05rem"}}>{already?"✓ ":""}{recipe.name}</div>
                <div style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>{recipe.outputDesc}</div>
              </div>
              {already?<span style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"0.78rem"}}>FORGED</span>:(
                <Btn onClick={()=>can&&onForge(recipe.id)} disabled={!can} variant={can?"amber":"dim"} style={{padding:"4px 10px",fontSize:"0.85rem"}}>Forge</Btn>
              )}
            </div>
            <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.75rem",marginBottom:8,fontStyle:"italic"}}>{recipe.flavor}</div>
            <div style={{borderTop:`1px solid ${T.border}`,paddingTop:8}}>
              {recipe.ingredients.map(ing=>{const have=ing.has(player); return(
                <div key={ing.label} style={{color:have?T.green:T.red,fontFamily:"'VT323',monospace",fontSize:"0.82rem",marginBottom:2}}>{have?"✓":"✗"}  {ing.label}</div>
              );})}
            </div>
          </Panel>
        );
      })}
      {visible.length===0&&<div style={{color:T.dim,fontFamily:"'VT323',monospace",textAlign:"center",padding:"20px 0"}}>No recipes available. Explore the mountain for more.</div>}
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
        <div style={{display:"flex",gap:12,marginTop:8,flexWrap:"wrap"}}>
          {hasHeaddress(player)&&<span style={{color:T.purple,fontFamily:"'VT323',monospace",fontSize:"0.82rem"}}>✦ Headdress · +1% evasion</span>}
          {player.critChance>0&&<span style={{color:T.gold,fontFamily:"'VT323',monospace",fontSize:"0.82rem"}}>⚡ {Math.round(player.critChance*100)}% crit chance</span>}
          {hasHoly(player)&&<span style={{color:T.blue,fontFamily:"'VT323',monospace",fontSize:"0.82rem"}}>☩ Holy damage active</span>}
          {player.fleeBonus>0&&<span style={{color:T.green,fontFamily:"'VT323',monospace",fontSize:"0.82rem"}}>🏃 +{Math.round(player.fleeBonus*100)}% flee rate</span>}
        </div>
        <Divider/>
        <div style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.78rem",marginBottom:4}}>
          {level<player.maxLevel?`Progress to Level ${level+1}:  ${player.xp-XP_CURVE[level]} / ${xpForNext(level,player.maxLevel)-XP_CURVE[level]} XP`:"Maximum level achieved."}
        </div>
        <XpBar xp={player.xp} level={level} maxLevel={player.maxLevel}/>
      </Panel>
      <Panel style={{marginBottom:12}}>
        <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.95rem",marginBottom:8}}>EQUIPMENT</div>
        {Object.entries(SLOT_LABELS).map(([slot,label])=>{const item=player.equipment[slot]; return(
          <div key={slot} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${T.border}`,fontFamily:"'VT323',monospace"}}>
            <span style={{color:T.dim,fontSize:"0.85rem"}}>{label}</span>
            <div style={{textAlign:"right"}}>
              <span style={{color:item?T.text:T.dim,fontSize:"0.85rem"}}>{item?item.name:"—"}</span>
              {item&&statLabel(item)!=="—"&&<div style={{color:T.purple,fontSize:"0.75rem"}}>{statLabel(item)}</div>}
            </div>
          </div>
        );})}
      </Panel>
      <Panel style={{marginBottom:12}}>
        <div style={{color:T.amber,fontFamily:"'VT323',monospace",fontSize:"0.95rem",marginBottom:8}}>LOOT BAG  ({player.inventory.length} items)</div>
        {lootItems.length===0?<div style={{color:T.dim,fontFamily:"'VT323',monospace"}}>— Empty —</div>:
          lootItems.map(item=>(
            <div key={item.name} style={{display:"flex",justifyContent:"space-between",fontFamily:"'VT323',monospace",color:T.text,padding:"5px 0",borderBottom:`1px solid ${T.border}`}}>
              <span>{item.name} <span style={{color:T.dim}}>×{item.count}</span></span>
              <span style={{color:T.gold}}>{item.value*item.count}g</span>
            </div>
          ))
        }
      </Panel>
      <Btn onClick={onBack} style={{width:"100%"}}>← Back</Btn>
    </div>
  );
};

// ── APP ───────────────────────────────────────────────────
export default function App(){
  useEffect(()=>{
    const link=document.createElement("link"); link.rel="stylesheet";
    link.href="https://fonts.googleapis.com/css2?family=VT323&display=swap";
    document.head.appendChild(link); return()=>document.head.removeChild(link);
  },[]);

  const [screen,      setScreen]      = useState("title");
  const [player,      setPlayer]      = useState(null);
  const [enemy,       setEnemy]       = useState(null);
  const [combatLog,   setCombatLog]   = useState([]);
  const [combatPhase, setCombatPhase] = useState("player_turn");
  const [prevScreen,  setPrevScreen]  = useState("town");
  const [huntZone,    setHuntZone]    = useState("forest");
  const [merchantOffer,setMerchantOffer]=useState(null);

  const pMaxLvl = player?.maxLevel??10;
  const level   = player ? getLevel(player.xp, pMaxLvl) : 1;
  const baseStats=player ? calcStats(level,player.equipment) : calcStats(1);
  const stats   = player ? {...baseStats, atk:baseStats.atk+(player.flatAtk||0), def:baseStats.def+(player.flatDef||0)} : baseStats;

  const handleName=(name)=>{ setPlayer(mkPlayer(name)); setScreen("town"); };
  const handleRest=()=>setPlayer(p=>({...p,hp:({...calcStats(getLevel(p.xp,p.maxLevel),p.equipment),atk:0,def:0}).maxHp+p.flatAtk*0||calcStats(getLevel(p.xp,p.maxLevel),p.equipment).maxHp}));

  // Correct rest: use full stats
  const doRest=()=>setPlayer(p=>{
    const lvl=getLevel(p.xp,p.maxLevel); const s=calcStats(lvl,p.equipment);
    return {...p,hp:s.maxHp};
  });

  const evasionAttack=(currentPlayer,currentEnemy,currentStats)=>{
    if(checkEvade(currentPlayer)) return {dmg:0,msg:`✦ ${currentEnemy.name}'s attack misses! (Headdress evasion)`,died:false};
    const dmg=Math.max(1,currentEnemy.atk+rand(-2,3)-currentStats.def);
    return {dmg,msg:`🐾 The ${currentEnemy.name} retaliates for ${dmg}!`,died:false};
  };

  const startFight=(e,zone)=>{
    setHuntZone(zone);
    if(e.special==="merchant"){
      setMerchantOffer(genOffer(player));
      setScreen("merchant_encounter");
      return;
    }
    if(e.special==="priest"){
      setScreen("priest_encounter");
      return;
    }
    setEnemy({...e,hp:e.maxHp});
    setCombatLog([`You venture into the ${zone==="mountain"?"mountain pass":"shadowed forest"}...`,`A ${e.name} ${zone==="mountain"?"emerges from the rocks":"lunges from the undergrowth"}!`]);
    setCombatPhase("player_turn");
    setScreen("combat");
  };

  const handleAttack=()=>{
    if(combatPhase!=="player_turn") return;
    const newLog=[];
    const isCrit = player.critChance>0 && Math.random()<player.critChance;
    const hDmg   = holyDmg(player);
    let pDmg     = Math.max(1,stats.atk+rand(-2,4)-enemy.def)+hDmg;
    if(isCrit) pDmg=Math.floor(pDmg*2);
    const suffix = (isCrit?" ⚡ CRITICAL HIT!":"")+(hDmg?" (+10 holy)":"");
    newLog.push(`⚔ You strike for ${pDmg} damage!${suffix}`);
    const newEHP = Math.max(0,enemy.hp-pDmg);

    if(newEHP<=0){
      const drops=rollLootTable(enemy.loot,player.flags||{});
      // Handle solidStrikes unique drop
      const newFlags={...player.flags};
      if(drops.some(d=>d.name==="Book: Solid Strikes V1")) newFlags.solidStrikesDropped=true;
      const newXp=player.xp+enemy.xp; const newLvl=getLevel(newXp,player.maxLevel); const lvUp=newLvl>level;
      newLog.push(`💀 The ${enemy.name} collapses!`);
      newLog.push(`✨ +${enemy.xp} XP earned!`);
      if(drops.length>0) newLog.push(`📦 Loot: ${drops.map(d=>d.name).join(", ")}`);
      if(lvUp) newLog.push(`🌟 LEVEL UP!  You are now Level ${newLvl}!`);
      setEnemy(e=>({...e,hp:0}));
      setPlayer(p=>{ const ns=calcStats(newLvl,p.equipment); return {...p,xp:newXp,inventory:[...p.inventory,...drops],hp:Math.min(p.hp+5,ns.maxHp),flags:newFlags}; });
      setCombatLog(prev=>[...prev,...newLog]); setCombatPhase("victory"); return;
    }

    const {dmg,msg}=evasionAttack(player,{...enemy,hp:newEHP},stats);
    newLog.push(msg);
    const newPHP=Math.max(0,player.hp-dmg);
    if(newPHP<=0){
      newLog.push(`💀 You fall unconscious...`); newLog.push(`You wake in camp, battered.`);
      setEnemy(e=>({...e,hp:newEHP}));
      setPlayer(p=>({...p,hp:Math.max(1,Math.floor(stats.maxHp*0.3))}));
      setCombatLog(prev=>[...prev,...newLog]); setCombatPhase("defeat"); return;
    }
    setEnemy(e=>({...e,hp:newEHP}));
    setPlayer(p=>({...p,hp:newPHP}));
    setCombatLog(prev=>[...prev,...newLog]);
  };

  const handleFlee=()=>{
    const threshold=0.42-(player.fleeBonus||0);
    if(Math.random()>threshold){
      setCombatLog(prev=>[...prev,"🏃 You dash to safety!"]); setCombatPhase("fled");
    } else {
      const {dmg,msg}=evasionAttack(player,enemy,stats);
      setPlayer(p=>({...p,hp:Math.max(1,p.hp-dmg)}));
      setCombatLog(prev=>[...prev,`🏃 Failed to flee! ${msg}`]);
    }
  };

  // Free action — heal only, no enemy retaliation
  const handleUseItem=(itemName)=>{
    const sp=SPECIAL[itemName]; if(!sp||sp.type!=="usable") return;
    const aleIdx=player.inventory.findIndex(i=>i.name===itemName); if(aleIdx===-1) return;
    const heal=rand(sp.healMin,sp.healMax); const inv=[...player.inventory]; inv.splice(aleIdx,1);
    const newHp=Math.min(player.hp+heal,stats.maxHp);
    setPlayer(p=>({...p,hp:newHp,inventory:inv}));
    const icon=itemName==="Warm Milk"?"🥛":"🍺";
    setCombatLog(prev=>[...prev,`${icon} You drink the ${itemName} and recover ${heal} HP!  [free action]`]);
  };

  const handleSell=(itemName)=>setPlayer(p=>{
    const idx=p.inventory.findIndex(i=>i.name===itemName); if(idx===-1) return p;
    const item=p.inventory[idx]; const inv=[...p.inventory]; inv.splice(idx,1);
    return {...p,gold:p.gold+sellValue(p,item.value),inventory:inv};
  });

  const handleSellAll=()=>setPlayer(p=>{
    const loot=p.inventory.filter(i=>isSellable(i.name)); const others=p.inventory.filter(i=>!isSellable(i.name));
    return {...p,gold:p.gold+loot.reduce((s,i)=>s+sellValue(p,i.value),0),inventory:others};
  });

  const handleBuy=(item)=>setPlayer(p=>{
    if(p.gold<item.cost) return p;
    const eq={...p.equipment,[item.slot]:item}; const ns=calcStats(getLevel(p.xp,p.maxLevel),eq);
    return {...p,gold:p.gold-item.cost,equipment:eq,hp:Math.min(p.hp,ns.maxHp)};
  });

  const handleOpenSack=(sackName)=>setPlayer(p=>{
    const idx=p.inventory.findIndex(i=>i.name===sackName); if(idx===-1) return p;
    const sp=SPECIAL[sackName]; const g=rand(sp.goldMin,sp.goldMax); const inv=[...p.inventory]; inv.splice(idx,1);
    return {...p,gold:p.gold+g,inventory:inv};
  });

  const handleReadBook=(bookName)=>setPlayer(p=>{
    const idx=p.inventory.findIndex(i=>i.name===bookName); if(idx===-1) return p;
    const sp=SPECIAL[bookName]; const inv=[...p.inventory]; inv.splice(idx,1);
    const flags={...p.flags}; let up={...p,inventory:inv};
    if(sp.effect==="solidStrikes"){ up={...up,critChance:(p.critChance||0)+0.01}; flags.solidStrikesDropped=true; }
    if(sp.effect==="ironWill")    { up={...up,flatDef:(p.flatDef||0)+5};          flags.ironWillLearned=true;    }
    if(sp.effect==="battleHymn")  { up={...up,flatAtk:(p.flatAtk||0)+5};          flags.battleHymnLearned=true;  }
    if(sp.effect==="swiftFeet")   { up={...up,fleeBonus:(p.fleeBonus||0)+0.15};   flags.swiftFeetLearned=true;   }
    if(sp.effect==="expandedMind"){ up={...up,maxLevel:15};                         flags.expandedMindLearned=true;}
    return {...up,flags};
  });

  const handleBuyMap=()=>setPlayer(p=>p.gold<1000?p:{...p,gold:p.gold-1000,inventory:[...p.inventory,{name:"Mountain Map",value:0}]});
  const handleForge=(id)=>{ const r=RECIPES.find(x=>x.id===id); if(r&&r.canCraft(player)) setPlayer(p=>r.forge(p)); };

  const handleMerchantBuy=(offer)=>{
    if(!offer||player.gold<offer.cost) return;
    setPlayer(p=>{
      let np={...p,gold:p.gold-offer.cost};
      if(offer.type==="recipe"||offer.type==="key"||offer.type==="usable"||offer.type==="book"){
        np={...np,inventory:[...np.inventory,{name:offer.name,value:0}]};
      } else if(offer.type==="gear"&&offer.item){
        const eq={...np.equipment,[offer.item.slot]:offer.item}; const ns=calcStats(getLevel(np.xp,np.maxLevel),eq);
        np={...np,equipment:eq,hp:Math.min(np.hp,ns.maxHp)};
      }
      return np;
    });
    setScreen(huntZone==="mountain"?"mountain_camp":"town");
  };

  const handlePriestDonate=()=>setPlayer(p=>{
    if(p.gold<500) return p;
    const np={...p,gold:p.gold-500};
    if(!p.flags.expandedMindLearned){
      return {...np,inventory:[...np.inventory,{name:"Book: Expansive Mind",value:0}]};
    }
    return {...np,holyExpiry:Date.now()+5*60*1000};
  });

  const goStats=(from)=>{ setPrevScreen(from); setScreen("stats"); };
  const returnFromCombat=()=>setScreen(huntZone==="mountain"?"mountain_camp":"town");
  const huntAgain=()=>huntZone==="mountain"?startFight(spawnMountain(),"mountain"):startFight(spawnForest(),"forest");

  const inMountain=["mountain_camp","blacksmith"].includes(screen)||(screen==="combat"&&huntZone==="mountain")||(screen==="merchant_encounter"&&huntZone==="mountain")||(screen==="priest_encounter"&&huntZone==="mountain");

  return(
    <div style={{background:T.bg,minHeight:"100vh",display:"flex",justifyContent:"center",alignItems:"flex-start",padding:"16px 8px",fontFamily:"'VT323',monospace"}}>
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

        {screen==="title"&&<TitleScreen onStart={()=>setScreen("name")}/>}
        {screen==="name" &&<NameScreen  onConfirm={handleName}/>}

        {screen==="town"&&player&&(
          <TownScreen player={player} level={level} stats={stats}
            onForest={()=>startFight(spawnForest(),"forest")}
            onShop={()=>setScreen("shop")}
            onStats={()=>goStats("town")}
            onRest={doRest}
            onMountain={()=>setScreen("mountain_camp")}
          />
        )}
        {screen==="mountain_camp"&&player&&(
          <MountainCampScreen player={player} level={level} stats={stats}
            onHunt={()=>startFight(spawnMountain(),"mountain")}
            onBlacksmith={()=>setScreen("blacksmith")}
            onStats={()=>goStats("mountain_camp")}
            onRest={doRest}
            onReturn={()=>setScreen("town")}
          />
        )}
        {screen==="combat"&&player&&enemy&&(
          <CombatScreen player={player} stats={stats} enemy={enemy}
            log={combatLog} phase={combatPhase}
            onAttack={handleAttack} onFlee={handleFlee} onUseItem={handleUseItem}
            onReturn={returnFromCombat}
            onHuntAgain={huntAgain}
          />
        )}
        {screen==="merchant_encounter"&&player&&(
          <MerchantEncounterScreen player={player} stats={stats} offer={merchantOffer}
            onBuy={handleMerchantBuy}
            onLeave={()=>setScreen(huntZone==="mountain"?"mountain_camp":"town")}
          />
        )}
        {screen==="priest_encounter"&&player&&(
          <PriestEncounterScreen player={player} stats={stats}
            onDonate={()=>{ handlePriestDonate(); setScreen(huntZone==="mountain"?"mountain_camp":"town"); }}
            onLeave={()=>setScreen(huntZone==="mountain"?"mountain_camp":"town")}
          />
        )}
        {screen==="shop"&&player&&(
          <ShopScreen player={player} level={level}
            onSell={handleSell} onSellAll={handleSellAll} onBuy={handleBuy}
            onOpenSack={handleOpenSack} onReadBook={handleReadBook}
            onBuyMap={handleBuyMap} onBack={()=>setScreen("town")}
          />
        )}
        {screen==="blacksmith"&&player&&(
          <BlacksmithScreen player={player} onForge={handleForge} onBack={()=>setScreen("mountain_camp")}/>
        )}
        {screen==="stats"&&player&&(
          <StatsScreen player={player} level={level} stats={stats} onBack={()=>setScreen(prevScreen)}/>
        )}

        {/* Footer */}
        <div style={{borderTop:`1px solid ${T.border}`,padding:"6px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#1a3320",fontFamily:"'VT323',monospace",fontSize:"0.72rem"}}>{inMountain?"Zone II: The Mountain":"Zone I: The Forest"}</span>
          {player&&!["title","name","combat"].includes(screen)&&(
            <span onClick={()=>goStats(screen)} style={{color:T.dim,fontFamily:"'VT323',monospace",fontSize:"0.72rem",cursor:"pointer"}}>[ stats ]</span>
          )}
        </div>
      </div>
    </div>
  );
}
