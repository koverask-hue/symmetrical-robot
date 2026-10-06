// Block definitions. A voxel stores one byte: an index into BLOCKS.
// tier: 0 soft, 1 medium, 2 hard, 3 indestructible. Tools carve each tier with a different radius.
export const VOXEL = 0.25; // metres per voxel edge

export const B = {
  AIR: 0, BEDROCK: 1, DIRT: 2, GRASS: 3, PLANK: 4, DARKWOOD: 5, PLASTER: 6,
  BRICK: 7, WBRICK: 8, CONCRETE: 9, METAL: 10, GLASS: 11, LEAVES: 12, ROOF: 13,
  CHAR: 14, ASPHALT: 15, GRAVEL: 16, VAULT: 17, BARK: 18, CARPET: 19, YELLOW: 20,
  PAVING: 21, VANRED: 22, TIRE: 23, TRIM: 24, CRATE: 25, LINE: 26, STEEL: 27,
};

const def = (name, hex, tier, o = {}) => ({
  name,
  color: [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255],
  tier,
  flammable: !!o.flammable,
  transparent: !!o.transparent,
  noise: o.noise ?? 0.06, // per-voxel brightness jitter
  pattern: o.pattern ?? null,
  density: o.density ?? 1, // tonnes per cubic metre
  sound: o.sound ?? 'stone',
  rough: o.rough ?? 0.88,
  metal: o.metal ?? 0,
});

export const BLOCKS = [];
BLOCKS[B.AIR] = def('air', 0, 0);
BLOCKS[B.BEDROCK] = def('bedrock', 0x3a3a40, 3, { noise: 0.1 });
BLOCKS[B.DIRT] = def('dirt', 0x6b4a2f, 0, { noise: 0.1, sound: 'dirt' });
BLOCKS[B.GRASS] = def('grass', 0x5f8f3a, 0, { noise: 0.12, sound: 'dirt' });
BLOCKS[B.PLANK] = def('plank', 0xb08350, 0, { flammable: true, pattern: 'plank', sound: 'wood', density: 0.6 });
BLOCKS[B.DARKWOOD] = def('dark wood', 0x6e4a2c, 0, { flammable: true, pattern: 'plank', sound: 'wood', density: 0.6 });
BLOCKS[B.PLASTER] = def('plaster', 0xe4ddd0, 0, { noise: 0.03, sound: 'plaster', density: 0.8 });
BLOCKS[B.BRICK] = def('brick', 0xa04a36, 1, { pattern: 'brick', density: 1.8 });
BLOCKS[B.WBRICK] = def('pale brick', 0xcdbfa6, 1, { pattern: 'brick', density: 1.8 });
BLOCKS[B.CONCRETE] = def('concrete', 0x9a9a96, 1, { noise: 0.05, density: 2.3 });
BLOCKS[B.METAL] = def('metal', 0x7d8790, 2, { noise: 0.04, sound: 'metal', density: 7.8, rough: 0.4, metal: 0.9 });
BLOCKS[B.GLASS] = def('glass', 0x9fd4e8, 0, { transparent: true, noise: 0, sound: 'glass', density: 2.5, rough: 0.04 });
BLOCKS[B.LEAVES] = def('leaves', 0x3f7a2e, 0, { flammable: true, noise: 0.18, sound: 'leaves', density: 0.2 });
BLOCKS[B.ROOF] = def('roof tile', 0x7a3328, 0, { pattern: 'brick', sound: 'plaster', density: 1.5 });
BLOCKS[B.CHAR] = def('charred wood', 0x1e1a18, 0, { noise: 0.15, sound: 'wood', density: 0.4 });
BLOCKS[B.ASPHALT] = def('asphalt', 0x38383b, 1, { noise: 0.08, density: 2.2, rough: 0.95 });
BLOCKS[B.GRAVEL] = def('gravel', 0x8c8478, 0, { noise: 0.15, sound: 'dirt' });
BLOCKS[B.VAULT] = def('vault steel', 0x4b5866, 2, { noise: 0.03, sound: 'metal', density: 7.8, rough: 0.3, metal: 1 });
BLOCKS[B.BARK] = def('bark', 0x5a4030, 0, { flammable: true, noise: 0.12, sound: 'wood', density: 0.7 });
BLOCKS[B.CARPET] = def('carpet', 0x7a2a3a, 0, { flammable: true, noise: 0.05, sound: 'dirt', density: 0.3 });
BLOCKS[B.YELLOW] = def('painted plaster', 0xd9b45a, 0, { noise: 0.03, sound: 'plaster', density: 0.8 });
BLOCKS[B.PAVING] = def('paving', 0xb3ada2, 1, { pattern: 'tile', density: 2.2, rough: 0.75 });
BLOCKS[B.VANRED] = def('van panel', 0xb8352b, 2, { noise: 0.02, sound: 'metal', density: 3, rough: 0.22, metal: 0.35 });
BLOCKS[B.TIRE] = def('rubber', 0x1c1c1c, 1, { noise: 0.04, sound: 'dirt', rough: 0.7 });
BLOCKS[B.TRIM] = def('window trim', 0xf0ece2, 0, { flammable: true, noise: 0.02, sound: 'wood', density: 0.6, rough: 0.5 });
BLOCKS[B.CRATE] = def('crate', 0x9c7444, 0, { flammable: true, pattern: 'plank', sound: 'wood', density: 0.5 });
BLOCKS[B.LINE] = def('road paint', 0xe8e2c8, 1, { noise: 0.04, density: 2.2 });
BLOCKS[B.STEEL] = def('steel beam', 0x5c6670, 2, { noise: 0.03, sound: 'metal', density: 7.8, rough: 0.45, metal: 0.85 });

export const isSolid = (id) => id !== B.AIR;
export const isOpaque = (id) => id !== B.AIR && !BLOCKS[id].transparent;
export const tierOf = (id) => BLOCKS[id].tier;
export const isFlammable = (id) => BLOCKS[id].flammable;
