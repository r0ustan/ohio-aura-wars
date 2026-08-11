import {
  Billboard,
  BillboardMode,
  ColliderLayer,
  engine,
  Entity,
  GltfContainer,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  ParticleSystem,
  pointerEventsSystem,
  Schemas,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { ceramic, glow, plastic, solid } from './materials'

export const FloorTile = engine.defineComponent('crazy-floor-tile', {
  baseY: Schemas.Number,
  phase: Schemas.Number,
  speed: Schemas.Number,
  amp: Schemas.Number
})

export const ARENA_CENTER = Vector3.create(24, 0, 24)
export const OHIO_ZONE_CENTER = Vector3.create(24, 0, 36)
export const OHIO_ZONE_RADIUS = 5.2
const OHIO_TILE_RADIUS_SQ = 49

/** Side spots the pink 2x zone can jump between */
const OHIO_SIDE_SPOTS = [
  Vector3.create(24, 0, 36), // north
  Vector3.create(24, 0, 12), // south
  Vector3.create(36, 0, 24), // east
  Vector3.create(12, 0, 24) // west
]

type FloorTileVisual = {
  x: number
  z: number
  dark: boolean
  pad: Entity
  edges: Entity[]
}

let startButton: Entity
let startLabel: Entity
let startBaseLower: Entity
let startBaseUpper: Entity
let howHitbox: Entity
let scoreboard: Entity
let bossRoot: Entity
let bossHead: Entity
let bossJawLower: Entity
let bossJawUpper: Entity
let bossMouthHole: Entity
let bossShoulderL: Entity
let bossShoulderR: Entity
let floorTiles: FloorTileVisual[] = []
let ohioTilePads: Entity[] = []
let ohioLabel: Entity
let ohioRelocateTimer = 8 + Math.random() * 6
let onStartCallback: (() => void) | null = null
let onHowToCallback: (() => void) | null = null
let onBonusCallback: (() => void) | null = null
let bossChompPhase = 0
let bossWavePhase = 0
let startControlsShown = true
let startOrbPulsePhase = 0

const START_ORB_SCALE = 1.35
const START_ORB_Y = 1.55
const START_BASE_LOWER = { w: 2.8, h: 0.7 }
const START_BASE_UPPER = { w: 2.1, h: 0.2 }
/** One collider covering both pedestal cylinders */
const HOW_HIT_R = 2.9
const HOW_HIT_H = 1.0
const HOW_HIT_Y = 0.5

let bonusRoot: Entity
let bonusBits: Entity[] = []
let bonusSparks: Entity
let bonusLabel: Entity
let bonusReady = false
let bonusBobPhase = 0
let bonusX = 40
let bonusZ = 24
let bonusHopTimer = 10
let bonusWasPlaying = false
/** Pickup + visual scale for Tron Bit */
const BONUS_PICKUP_RADIUS = 5.0
const BONUS_ROOT_SCALE = 1.55
/** High enough that standing won't reach — jump required */
const BONUS_BASE_Y = 4.35
const BONUS_FLOAT_AMP = 0.45
/** Player feet must clear this to collect (approx jump height) */
const BONUS_MIN_PLAYER_Y = 2.35
/** Prevent re-trigger while still standing inside the orb after pickup */
let bonusInsideLatch = false

const BIT_MODELS = ['models/bit-soft.glb', 'models/bit-mid.glb', 'models/bit-star.glb']

function randomBonusSpot() {
  // Keep clear of walls, center PLAY pad, and Skibidi toilet side
  for (let tries = 0; tries < 24; tries++) {
    const x = 8 + Math.random() * 32
    const z = 8 + Math.random() * 32
    const dxC = x - 24
    const dzC = z - 24
    const dxBoss = x - 10
    const dzBoss = z - 24
    if (dxC * dxC + dzC * dzC < 36) continue // center pad
    if (dxBoss * dxBoss + dzBoss * dzBoss < 25) continue // toilet
    return { x, z }
  }
  return { x: 40, z: 24 }
}

function placeBonusAt(x: number, z: number) {
  bonusX = x
  bonusZ = z
  const y = BONUS_BASE_Y
  if (Transform.has(bonusRoot)) Transform.getMutable(bonusRoot).position = Vector3.create(x, y, z)
  if (Transform.has(bonusSparks)) Transform.getMutable(bonusSparks).position = Vector3.create(x, y, z)
  if (Transform.has(bonusLabel)) Transform.getMutable(bonusLabel).position = Vector3.create(x, y + 2.8, z)
}

function setBonusVisible(visible: boolean) {
  if (Transform.has(bonusRoot)) {
    Transform.getMutable(bonusRoot).scale = visible
      ? Vector3.create(BONUS_ROOT_SCALE, BONUS_ROOT_SCALE, BONUS_ROOT_SCALE)
      : Vector3.create(0, 0, 0)
  }
  if (TextShape.has(bonusLabel)) {
    TextShape.getMutable(bonusLabel).text = visible ? 'BONUS\n+777' : ''
    TextShape.getMutable(bonusLabel).textColor = Color4.fromHexString('#5ef0ff')
  }
  if (ParticleSystem.has(bonusSparks)) {
    ParticleSystem.getMutable(bonusSparks).active = visible
  }
}

type WallGlowPanel = { entity: Entity; phase: number }
let wallGlowPanels: WallGlowPanel[] = []
let wallFlowPhase = 0

export function getBossEntity() {
  return bossRoot
}

export function getScoreboard() {
  return scoreboard
}

export function setStartHandler(cb: () => void) {
  onStartCallback = cb
}

export function setHowToHandler(cb: () => void) {
  onHowToCallback = cb
}

export function setBonusHandler(cb: () => void) {
  onBonusCallback = cb
}

/** Enable/disable PLAY + HOW clicks — visuals stay visible during runs. */
export function setStartControlsVisible(enabled: boolean) {
  startControlsShown = enabled

  if (Transform.has(startButton)) {
    if (enabled) {
      MeshCollider.setSphere(startButton)
    } else if (MeshCollider.has(startButton)) {
      MeshCollider.deleteFrom(startButton)
    }
  }

  if (Transform.has(howHitbox)) {
    if (enabled) {
      MeshCollider.setCylinder(howHitbox, ColliderLayer.CL_POINTER)
    } else if (MeshCollider.has(howHitbox)) {
      MeshCollider.deleteFrom(howHitbox)
    }
  }
}

/** Soft scale + glow pulse for the green PLAY orb. */
export function tickStartOrb(dt: number) {
  if (!Transform.has(startButton)) return
  startOrbPulsePhase += dt * 3.4
  const pulse = 1 + Math.sin(startOrbPulsePhase) * 0.14
  const bob = Math.sin(startOrbPulsePhase * 0.85) * 0.1
  const s = START_ORB_SCALE * pulse
  const t = Transform.getMutable(startButton)
  t.scale = Vector3.create(s, s, s)
  t.position.y = START_ORB_Y + bob

  if (Material.has(startButton)) {
    Material.setPbrMaterial(startButton, glow('#5dff7a', 2.4 + Math.sin(startOrbPulsePhase * 1.6) * 1.1))
  }
}

export function buildArena() {
  buildFloor()
  buildWalls()
  buildPillars()
  buildOhioZone()
  buildTitleSigns()
  buildStartPedestal()
  buildBonusPedestal()
  buildBossToilet()
}

const SOLID_COLLISION = ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER

function box(
  pos: Vector3,
  scale: Vector3,
  material: ReturnType<typeof solid>,
  collides = true
) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale })
  MeshRenderer.setBox(e)
  if (collides) MeshCollider.setBox(e, SOLID_COLLISION)
  Material.setPbrMaterial(e, material)
  return e
}

function cylinder(
  pos: Vector3,
  scale: Vector3,
  material: ReturnType<typeof solid>,
  collides = true
) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale })
  MeshRenderer.setCylinder(e)
  if (collides) MeshCollider.setCylinder(e, SOLID_COLLISION)
  Material.setPbrMaterial(e, material)
  return e
}

function tileInOhio(x: number, z: number) {
  const dx = x - OHIO_ZONE_CENTER.x
  const dz = z - OHIO_ZONE_CENTER.z
  return dx * dx + dz * dz < OHIO_TILE_RADIUS_SQ
}

function paintFloorTile(tile: FloorTileVisual, inOhio: boolean, active = false) {
  if (inOhio) {
    if (active) {
      Material.setPbrMaterial(
        tile.pad,
        glow(tile.dark ? '#ff4ec7' : '#ff8ad8', tile.dark ? 1.4 : 1.7, 0.5)
      )
    } else {
      Material.setPbrMaterial(
        tile.pad,
        glow(tile.dark ? '#e85aad' : '#ff7ac8', tile.dark ? 0.9 : 1.15, 0.55)
      )
    }
  } else {
    Material.setPbrMaterial(tile.pad, solid(tile.dark ? '#23202c' : '#2c2836', 0.9))
  }

  const edgeMat = glow(inOhio ? '#ff4ec7' : '#3db8ff', 2.8, 0.25)
  for (const edge of tile.edges) {
    Material.setPbrMaterial(edge, edgeMat)
  }
}

function applyOhioZoneVisuals(active = false) {
  ohioTilePads = []
  for (const tile of floorTiles) {
    const inOhio = tileInOhio(tile.x, tile.z)
    paintFloorTile(tile, inOhio, active)
    if (inOhio) ohioTilePads.push(tile.pad)
  }
}

function pickNextOhioSpot(): Vector3 {
  const others = OHIO_SIDE_SPOTS.filter(
    (s) => Math.abs(s.x - OHIO_ZONE_CENTER.x) > 0.1 || Math.abs(s.z - OHIO_ZONE_CENTER.z) > 0.1
  )
  const pool = others.length > 0 ? others : OHIO_SIDE_SPOTS
  return pool[Math.floor(Math.random() * pool.length)]
}

export function relocateOhioZone() {
  const next = pickNextOhioSpot()
  OHIO_ZONE_CENTER.x = next.x
  OHIO_ZONE_CENTER.y = next.y
  OHIO_ZONE_CENTER.z = next.z

  if (ohioLabel && Transform.has(ohioLabel)) {
    Transform.getMutable(ohioLabel).position = Vector3.create(next.x, 2.8, next.z)
  }

  applyOhioZoneVisuals(false)
  ohioRelocateTimer = 8 + Math.random() * 7
}

/** Call every frame — jumps the pink 2x zone to another side every ~8–15s */
export function tickOhioZoneRelocation(dt: number) {
  ohioRelocateTimer -= dt
  if (ohioRelocateTimer <= 0) relocateOhioZone()
}

function buildFloor() {
  // Static slab under the tiles — PHYSICS only (gaps / fallback).
  // No CL_POINTER so looking down doesn't steal clicks from characters.
  const base = engine.addEntity()
  Transform.create(base, {
    position: Vector3.create(24, -0.08, 24),
    scale: Vector3.create(47, 0.16, 47)
  })
  MeshRenderer.setBox(base)
  MeshCollider.setBox(base, ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(base, solid('#1a1820', 0.92))

  floorTiles = []
  ohioTilePads = []

  // Bouncing tiles: MeshCollider lives on the SAME entity FloorTile moves.
  // (Child colliders under a moving parent are unreliable in the browser client.)
  for (let x = 2; x < 46; x += 4) {
    for (let z = 2; z < 46; z += 4) {
      const dx = x - 24
      const dzPad = z - 24
      if (dx * dx + dzPad * dzPad < 36) continue

      const inOhio = tileInOhio(x, z)
      const dark = ((x + z) / 4) % 2 === 0

      const tile = engine.addEntity()
      Transform.create(tile, {
        position: Vector3.create(x, 0.05, z),
        scale: Vector3.create(3.7, 0.18, 3.7)
      })
      MeshRenderer.setBox(tile)
      MeshCollider.setBox(tile, ColliderLayer.CL_PHYSICS)
      FloorTile.create(tile, {
        baseY: 0.05,
        phase: Math.random() * Math.PI * 2,
        speed: inOhio ? 0.9 + Math.random() * 2.2 : 0.7 + Math.random() * 2.4,
        amp: inOhio ? 0.2 + Math.random() * 0.9 : 0.15 + Math.random() * 1.1
      })

      const edges = addTileEdgeGlow(tile, inOhio ? '#ff4ec7' : '#3db8ff')
      const visual: FloorTileVisual = { x, z, dark, pad: tile, edges }
      floorTiles.push(visual)
      paintFloorTile(visual, inOhio, false)
      if (inOhio) ohioTilePads.push(tile)
    }
  }
}

/** Thin emissive trim — parent tile is scaled (3.7, 0.18, 3.7), so locals are inverse-compensated. */
function addTileEdgeGlow(tile: Entity, colorHex: string): Entity[] {
  const edgeMat = glow(colorHex, 2.8, 0.25)
  const sx = 3.7
  const sy = 0.18
  const sz = 3.7
  const y = 0.12 / sy
  const half = 1.88
  const thick = 0.08
  const tall = 0.1
  const long = 3.76

  const edges: Array<{ pos: Vector3; scale: Vector3 }> = [
    {
      pos: Vector3.create(0, y, half / sz),
      scale: Vector3.create(long / sx, tall / sy, thick / sz)
    },
    {
      pos: Vector3.create(0, y, -half / sz),
      scale: Vector3.create(long / sx, tall / sy, thick / sz)
    },
    {
      pos: Vector3.create(half / sx, y, 0),
      scale: Vector3.create(thick / sx, tall / sy, long / sz)
    },
    {
      pos: Vector3.create(-half / sx, y, 0),
      scale: Vector3.create(thick / sx, tall / sy, long / sz)
    }
  ]

  const entities: Entity[] = []
  for (const edge of edges) {
    const e = engine.addEntity()
    Transform.create(e, {
      parent: tile,
      position: edge.pos,
      scale: edge.scale
    })
    MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, edgeMat)
    entities.push(e)
  }
  return entities
}

export function floorTileSystem(dt: number) {
  for (const [entity] of engine.getEntitiesWith(FloorTile, Transform)) {
    const tile = FloorTile.getMutable(entity)
    tile.phase += dt * tile.speed
    // Occasional speed/amp jitter for unpredictability
    if (Math.random() < 0.002) {
      tile.speed = 0.6 + Math.random() * 2.8
      tile.amp = 0.12 + Math.random() * 1.25
    }
    const t = Transform.getMutable(entity)
    t.position.y = tile.baseY + (0.5 + 0.5 * Math.sin(tile.phase)) * tile.amp
  }
}

/** HSV → RGB Color3 (h in 0..1) */
function hsvColor(h: number, s: number, v: number): Color3 {
  const hh = ((h % 1) + 1) % 1
  const i = Math.floor(hh * 6)
  const f = hh * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0:
      return Color3.create(v, t, p)
    case 1:
      return Color3.create(q, v, p)
    case 2:
      return Color3.create(p, v, t)
    case 3:
      return Color3.create(p, q, v)
    case 4:
      return Color3.create(t, p, v)
    default:
      return Color3.create(v, p, q)
  }
}

function addWallGlowPanel(pos: Vector3, scale: Vector3, phase: number) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale })
  MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, glow('#ff4ec7', 1.4, 0.4))
  wallGlowPanels.push({ entity: e, phase })
}

function buildWalls() {
  const h = 5.5
  const t = 0.45
  // Tall invisible physics shell — stops double-jump escapes over the trim
  const barrierH = 22
  wallGlowPanels = []

  // Solid shells — physics (block player) + pointer (block click-through)
  box(Vector3.create(24, h / 2, 47.6), Vector3.create(47, h, t), solid('#1a1520', 0.92), true)
  box(Vector3.create(24, h / 2, 0.4), Vector3.create(47, h, t), solid('#1a1520', 0.92), true)
  box(Vector3.create(0.4, h / 2, 24), Vector3.create(t, h, 47), solid('#18141e', 0.92), true)
  box(Vector3.create(47.6, h / 2, 24), Vector3.create(t, h, 47), solid('#18141e', 0.92), true)

  // Invisible tall colliders stacked on the same wall lines (no renderer)
  const addBarrier = (pos: Vector3, scale: Vector3) => {
    const e = engine.addEntity()
    Transform.create(e, { position: pos, scale })
    MeshCollider.setBox(e, ColliderLayer.CL_PHYSICS)
  }
  addBarrier(Vector3.create(24, barrierH / 2, 47.6), Vector3.create(48, barrierH, t + 0.15))
  addBarrier(Vector3.create(24, barrierH / 2, 0.4), Vector3.create(48, barrierH, t + 0.15))
  addBarrier(Vector3.create(0.4, barrierH / 2, 24), Vector3.create(t + 0.15, barrierH, 48))
  addBarrier(Vector3.create(47.6, barrierH / 2, 24), Vector3.create(t + 0.15, barrierH, 48))

  // Flowing emissive bands — phase runs around the arena perimeter
  const segs = 8
  const rows = 3
  const bandH = h / rows
  for (let row = 0; row < rows; row++) {
    const y = bandH * 0.5 + row * bandH
    for (let i = 0; i < segs; i++) {
      const u = (i + 0.5) / segs
      const span = 47 / segs
      const x = 0.5 + u * 47
      const z = 0.5 + u * 47
      const rowPhase = row * 0.1

      addWallGlowPanel(
        Vector3.create(x, y, 47.35),
        Vector3.create(span * 0.92, bandH * 0.86, 0.08),
        u + rowPhase
      )
      addWallGlowPanel(
        Vector3.create(x, y, 0.65),
        Vector3.create(span * 0.92, bandH * 0.86, 0.08),
        0.5 + u + rowPhase
      )
      addWallGlowPanel(
        Vector3.create(47.35, y, z),
        Vector3.create(0.08, bandH * 0.86, span * 0.92),
        0.25 + u + rowPhase
      )
      addWallGlowPanel(
        Vector3.create(0.65, y, z),
        Vector3.create(0.08, bandH * 0.86, span * 0.92),
        0.75 + u + rowPhase
      )
    }
  }

  // Top trim also flows with the wave
  for (let i = 0; i < segs; i++) {
    const u = (i + 0.5) / segs
    const span = 47 / segs
    const x = 0.5 + u * 47
    const z = 0.5 + u * 47
    addWallGlowPanel(Vector3.create(x, h + 0.12, 47.55), Vector3.create(span * 0.95, 0.14, 0.18), u)
    addWallGlowPanel(Vector3.create(x, h + 0.12, 0.45), Vector3.create(span * 0.95, 0.14, 0.18), 0.5 + u)
    addWallGlowPanel(Vector3.create(47.55, h + 0.12, z), Vector3.create(0.18, 0.14, span * 0.95), 0.25 + u)
    addWallGlowPanel(Vector3.create(0.45, h + 0.12, z), Vector3.create(0.18, 0.14, span * 0.95), 0.75 + u)
  }
}

let wallPaintAccum = 0

/** Soft rainbow emission wave around the arena walls */
export function tickWallLights(dt: number) {
  wallFlowPhase += dt * 0.22
  wallPaintAccum += dt
  if (wallPaintAccum < 0.07) return
  wallPaintAccum = 0

  for (const panel of wallGlowPanels) {
    if (!Material.has(panel.entity)) continue
    const hue = wallFlowPhase * 0.35 + panel.phase * 0.85
    const c = hsvColor(hue, 0.78, 1)
    const dim = 0.22
    Material.setPbrMaterial(panel.entity, {
      albedoColor: Color4.create(c.r * dim, c.g * dim, c.b * dim, 1),
      emissiveColor: c,
      emissiveIntensity: 1.55 + 0.55 * Math.sin(wallFlowPhase * 2.2 + panel.phase * 6),
      roughness: 0.42,
      metallic: 0.08
    })
  }
}

function buildPillars() {
  // Snug against the four wall-corner intersections (walls at ~0.4 / 47.6)
  const c = 1.15
  const far = 48 - c
  const spots = [
    Vector3.create(c, 0, c),
    Vector3.create(far, 0, c),
    Vector3.create(c, 0, far),
    Vector3.create(far, 0, far)
  ]
  spots.forEach((p) => {
    // 2× original width; height is 1/3 of the previous tall pillars (19.2 → 6.4)
    const pillarH = 6.4
    cylinder(
      Vector3.create(p.x, pillarH / 2, p.z),
      Vector3.create(1.3, pillarH, 1.3),
      solid('#3a3548', 0.75),
      true
    )
    const lamp = engine.addEntity()
    Transform.create(lamp, {
      position: Vector3.create(p.x, pillarH + 0.35, p.z),
      scale: Vector3.create(1.1, 0.5, 1.1)
    })
    MeshRenderer.setSphere(lamp)
    Material.setPbrMaterial(lamp, glow('#ffd27a', 2.0))
  })
}

function buildOhioZone() {
  ohioLabel = engine.addEntity()
  Transform.create(ohioLabel, {
    position: Vector3.create(OHIO_ZONE_CENTER.x, 2.8, OHIO_ZONE_CENTER.z)
  })
  TextShape.create(ohioLabel, {
    text: '2X POINTS',
    fontSize: 2.4,
    textColor: Color4.fromHexString('#ff7ac8'),
    outlineWidth: 0.18,
    outlineColor: Color4.Black()
  })
  Billboard.create(ohioLabel, { billboardMode: BillboardMode.BM_Y })
}

function buildTitleSigns() {
  const title = engine.addEntity()
  Transform.create(title, {
    position: Vector3.create(24, 8.8, 24)
  })
  TextShape.create(title, {
    text: 'OHIO AURA WARS',
    fontSize: 4.2,
    textColor: Color4.fromHexString('#f0e6ff'),
    outlineWidth: 0.2,
    outlineColor: Color4.Black()
  })
  Billboard.create(title, { billboardMode: BillboardMode.BM_Y })

  scoreboard = engine.addEntity()
  Transform.create(scoreboard, {
    position: Vector3.create(24, 7.5, 24)
  })
  // Hidden until game over — results are shown here and in the UI panel
  TextShape.create(scoreboard, {
    text: '',
    fontSize: 1.8,
    textColor: Color4.fromHexString('#b8f5c0'),
    outlineWidth: 0.12,
    outlineColor: Color4.Black()
  })
  Billboard.create(scoreboard, { billboardMode: BillboardMode.BM_Y })
}

function buildStartPedestal() {
  // Visual cylinders — physics only (no POINTER, so they don't steal a second outline)
  startBaseLower = cylinder(
    Vector3.create(24, 0.35, 24),
    Vector3.create(START_BASE_LOWER.w, START_BASE_LOWER.h, START_BASE_LOWER.w),
    solid('#2a2635', 0.8),
    false
  )
  MeshCollider.setCylinder(startBaseLower, ColliderLayer.CL_PHYSICS)
  startBaseUpper = cylinder(
    Vector3.create(24, 0.8, 24),
    Vector3.create(START_BASE_UPPER.w, START_BASE_UPPER.h, START_BASE_UPPER.w),
    solid('#4a4058', 0.55),
    false
  )
  MeshCollider.setCylinder(startBaseUpper, ColliderLayer.CL_PHYSICS)

  // Single HOW hitbox wrapping the whole pedestal as one clickable piece
  howHitbox = engine.addEntity()
  Transform.create(howHitbox, {
    position: Vector3.create(24, HOW_HIT_Y, 24),
    scale: Vector3.create(HOW_HIT_R, HOW_HIT_H, HOW_HIT_R)
  })
  MeshCollider.setCylinder(howHitbox, ColliderLayer.CL_POINTER)

  pointerEventsSystem.onPointerDown(
    {
      entity: howHitbox,
      opts: { button: InputAction.IA_POINTER, hoverText: 'How to play', maxDistance: 14 }
    },
    () => {
      if (!startControlsShown) return
      if (onHowToCallback) onHowToCallback()
    }
  )

  startButton = engine.addEntity()
  Transform.create(startButton, {
    position: Vector3.create(24, START_ORB_Y, 24),
    scale: Vector3.create(START_ORB_SCALE, START_ORB_SCALE, START_ORB_SCALE)
  })
  MeshRenderer.setSphere(startButton)
  MeshCollider.setSphere(startButton)
  Material.setPbrMaterial(startButton, glow('#5dff7a', 2.8))

  startLabel = engine.addEntity()
  Transform.create(startLabel, {
    position: Vector3.create(24, 2.85, 24)
  })
  TextShape.create(startLabel, {
    text: 'PLAY',
    fontSize: 2.6,
    textColor: Color4.fromHexString('#5dff7a'),
    outlineWidth: 0.2,
    outlineColor: Color4.Black()
  })
  Billboard.create(startLabel, { billboardMode: BillboardMode.BM_Y })

  pointerEventsSystem.onPointerDown(
    {
      entity: startButton,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: 'Play',
        maxDistance: 14
      }
    },
    () => {
      if (!startControlsShown) return
      if (onStartCallback) onStartCallback()
    }
  )
}

/** Floating Tron Bit — faceted cyan polyhedron that morphs between soft / mid / star. */
function buildBonusPedestal() {
  const spot = randomBonusSpot()
  bonusX = spot.x
  bonusZ = spot.z
  const x = bonusX
  const z = bonusZ
  const y = BONUS_BASE_Y

  bonusRoot = engine.addEntity()
  Transform.create(bonusRoot, {
    position: Vector3.create(x, y, z),
    scale: Vector3.create(BONUS_ROOT_SCALE, BONUS_ROOT_SCALE, BONUS_ROOT_SCALE)
  })

  bonusBits = []
  for (const src of BIT_MODELS) {
    const bit = engine.addEntity()
    Transform.create(bit, {
      parent: bonusRoot,
      position: Vector3.create(0, 0, 0),
      scale: Vector3.create(0, 0, 0)
    })
    GltfContainer.create(bit, { src })
    bonusBits.push(bit)
  }
  // Start on mid form
  if (Transform.has(bonusBits[1])) {
    Transform.getMutable(bonusBits[1]).scale = Vector3.create(1, 1, 1)
  }

  bonusSparks = engine.addEntity()
  Transform.create(bonusSparks, {
    position: Vector3.create(x, y, z)
  })
  if (!isMobile()) {
    ParticleSystem.create(bonusSparks, {
      active: false,
      loop: true,
      rate: 22,
      maxParticles: 50,
      lifetime: 0.4,
      gravity: 0.05,
      billboard: true,
      blendMode: 1,
      shape: ParticleSystem.Shape.Sphere({ radius: 0.7 }),
      initialSize: { start: 0.05, end: 0.12 },
      sizeOverTime: { start: 1, end: 0.1 },
      initialVelocitySpeed: { start: 0.8, end: 2.4 },
      initialColor: {
        start: Color4.create(0.4, 1, 1, 1),
        end: Color4.create(0.1, 0.7, 0.9, 0.85)
      },
      colorOverTime: {
        start: Color4.create(0.3, 0.95, 1, 0.85),
        end: Color4.create(0.05, 0.4, 0.7, 0)
      }
    })
  }

  bonusLabel = engine.addEntity()
  Transform.create(bonusLabel, {
    position: Vector3.create(x, y + 2.8, z)
  })
  TextShape.create(bonusLabel, {
    text: '',
    fontSize: 2.8,
    textColor: Color4.fromHexString('#5ef0ff'),
    outlineWidth: 0.22,
    outlineColor: Color4.Black()
  })
  Billboard.create(bonusLabel, { billboardMode: BillboardMode.BM_Y })

  setBonusVisible(false)
}

/** Bob / morph / spin while visible; hide during cooldown; relocate when it returns. */
export function tickBonusPad(dt: number, cooldown: number, playing: boolean) {
  if (!bonusRoot || !Transform.has(bonusRoot) || !TextShape.has(bonusLabel)) return

  const ready = playing && cooldown <= 0

  if (bonusWasPlaying && !playing) {
    bonusReady = false
    setBonusVisible(false)
    bonusInsideLatch = false
  }
  if (!bonusWasPlaying && playing && ready) {
    bonusReady = true
    const spot = randomBonusSpot()
    placeBonusAt(spot.x, spot.z)
    setBonusVisible(true)
    bonusInsideLatch = false
    bonusHopTimer = 8 + Math.random() * 6
  }
  bonusWasPlaying = playing

  if (bonusReady && !ready && playing) {
    bonusReady = false
    setBonusVisible(false)
    bonusInsideLatch = true
  }

  if (!bonusReady && ready) {
    bonusReady = true
    const spot = randomBonusSpot()
    placeBonusAt(spot.x, spot.z)
    setBonusVisible(true)
    bonusInsideLatch = false
    bonusHopTimer = 8 + Math.random() * 6
  }

  if (!ready) {
    return
  }

  bonusHopTimer -= dt
  if (bonusHopTimer <= 0) {
    bonusHopTimer = 8 + Math.random() * 6
    const spot = randomBonusSpot()
    placeBonusAt(spot.x, spot.z)
    bonusInsideLatch = false
  }

  bonusBobPhase += dt
  const bob = Math.sin(bonusBobPhase * 1.7) * BONUS_FLOAT_AMP
  const y = BONUS_BASE_Y + bob
  const pulse = 1 + 0.08 * Math.sin(bonusBobPhase * 4.2)
  const spinY = bonusBobPhase * 160
  const spinX = Math.sin(bonusBobPhase * 1.4) * 28
  const spinZ = Math.cos(bonusBobPhase * 1.1) * 22

  const root = Transform.getMutable(bonusRoot)
  root.position.x = bonusX
  root.position.y = y
  root.position.z = bonusZ
  root.rotation = Quaternion.fromEulerDegrees(spinX, spinY, spinZ)
  root.scale = Vector3.create(
    BONUS_ROOT_SCALE * pulse,
    BONUS_ROOT_SCALE * pulse,
    BONUS_ROOT_SCALE * pulse
  )

  // Morph across soft → mid → star → soft (Bit-style shape shifts)
  const cycle = (bonusBobPhase * 0.28) % 3
  const i0 = Math.floor(cycle) % 3
  const i1 = (i0 + 1) % 3
  const t = cycle - Math.floor(cycle)
  // Smoothstep blend
  const u = t * t * (3 - 2 * t)
  for (let i = 0; i < bonusBits.length; i++) {
    if (!Transform.has(bonusBits[i])) continue
    let s = 0
    if (i === i0) s = 1 - u
    else if (i === i1) s = u
    // Keep a tiny residual so GLTF stays loaded
    const show = s > 0.02 ? s : 0.001
    Transform.getMutable(bonusBits[i]).scale = Vector3.create(show, show, show)
  }

  if (Transform.has(bonusSparks)) {
    const sp = Transform.getMutable(bonusSparks)
    sp.position.x = bonusX
    sp.position.y = y
    sp.position.z = bonusZ
  }
  if (Transform.has(bonusLabel)) {
    const lb = Transform.getMutable(bonusLabel)
    lb.position.x = bonusX
    lb.position.y = y + 2.8
    lb.position.z = bonusZ
  }

  if (!Transform.has(engine.PlayerEntity)) {
    bonusInsideLatch = false
    return
  }

  const p = Transform.get(engine.PlayerEntity).position
  const dx = p.x - bonusX
  const dz = p.z - bonusZ
  const near =
    dx * dx + dz * dz <= BONUS_PICKUP_RADIUS * BONUS_PICKUP_RADIUS && p.y >= BONUS_MIN_PLAYER_Y

  if (!near) {
    bonusInsideLatch = false
    return
  }
  if (bonusInsideLatch) return

  bonusInsideLatch = true
  if (onBonusCallback) onBonusCallback()
}

function buildBossToilet() {
  bossRoot = engine.addEntity()
  Transform.create(bossRoot, {
    position: Vector3.create(10, 0, 24),
    scale: Vector3.create(2, 2, 2)
  })

  const skin = plastic('#c47858')
  const shirt = solid('#6a6e78', 0.65)
  const pants = solid('#1a1020', 0.8)

  // --- Toilet ---
  const bowl = engine.addEntity()
  Transform.create(bowl, {
    parent: bossRoot,
    position: Vector3.create(0, 0.75, 0),
    scale: Vector3.create(2.3, 1.25, 2.3)
  })
  MeshRenderer.setCylinder(bowl)
  MeshCollider.setCylinder(bowl)
  Material.setPbrMaterial(bowl, ceramic('#f0f0f4'))

  const tank = engine.addEntity()
  Transform.create(tank, {
    parent: bossRoot,
    position: Vector3.create(0, 1.5, -0.9),
    scale: Vector3.create(1.8, 1.4, 0.7)
  })
  MeshRenderer.setBox(tank)
  Material.setPbrMaterial(tank, ceramic('#e4e4ea'))

  // Rim / lid lip on top of the fill tank (not the base bowl)
  const tankRim = engine.addEntity()
  Transform.create(tankRim, {
    parent: bossRoot,
    position: Vector3.create(0, 2.22, -0.9),
    scale: Vector3.create(1.95, 0.12, 0.85)
  })
  MeshRenderer.setBox(tankRim)
  Material.setPbrMaterial(tankRim, ceramic('#f7f7fb'))

  // Slight inset on the tank lid
  const tankLid = engine.addEntity()
  Transform.create(tankLid, {
    parent: bossRoot,
    position: Vector3.create(0, 2.3, -0.9),
    scale: Vector3.create(1.7, 0.08, 0.62)
  })
  MeshRenderer.setBox(tankLid)
  Material.setPbrMaterial(tankLid, ceramic('#ececf4'))

  // Ceramic rim lip on top of the base bowl
  const rim = engine.addEntity()
  Transform.create(rim, {
    parent: bossRoot,
    position: Vector3.create(0, 1.4, 0.02),
    scale: Vector3.create(2.55, 0.16, 2.55)
  })
  MeshRenderer.setCylinder(rim)
  Material.setPbrMaterial(rim, ceramic('#f7f7fb'))

  // Inner rim shelf
  const rimInner = engine.addEntity()
  Transform.create(rimInner, {
    parent: bossRoot,
    position: Vector3.create(0, 1.42, 0.02),
    scale: Vector3.create(2.05, 0.1, 2.05)
  })
  MeshRenderer.setCylinder(rimInner)
  Material.setPbrMaterial(rimInner, ceramic('#ebebf2'))

  const seat = engine.addEntity()
  Transform.create(seat, {
    parent: bossRoot,
    position: Vector3.create(0, 1.52, 0.05),
    scale: Vector3.create(2.2, 0.12, 2.2)
  })
  MeshRenderer.setCylinder(seat)
  Material.setPbrMaterial(seat, solid('#d8d8e2', 0.4))

  const water = engine.addEntity()
  Transform.create(water, {
    parent: bossRoot,
    position: Vector3.create(0, 1.15, 0.1),
    scale: Vector3.create(1.5, 0.15, 1.5)
  })
  MeshRenderer.setCylinder(water)
  Material.setPbrMaterial(water, glow('#4ec4ff', 1.5, 0.12))

  // Compact flush lever on the right side of the tank
  const leverBase = engine.addEntity()
  Transform.create(leverBase, {
    parent: bossRoot,
    position: Vector3.create(0.92, 1.9, -0.9),
    scale: Vector3.create(0.1, 0.1, 0.1)
  })
  MeshRenderer.setCylinder(leverBase)
  Material.setPbrMaterial(leverBase, plastic('#c0c8d4', 0.25))

  const leverArm = engine.addEntity()
  Transform.create(leverArm, {
    parent: bossRoot,
    position: Vector3.create(1.05, 1.9, -0.9),
    scale: Vector3.create(0.22, 0.05, 0.05),
    rotation: Quaternion.fromEulerDegrees(0, 0, 8)
  })
  MeshRenderer.setBox(leverArm)
  Material.setPbrMaterial(leverArm, plastic('#b8c0cc', 0.22))

  const leverHandle = engine.addEntity()
  Transform.create(leverHandle, {
    parent: bossRoot,
    position: Vector3.create(1.18, 1.87, -0.9),
    scale: Vector3.create(0.09, 0.16, 0.09),
    rotation: Quaternion.fromEulerDegrees(0, 0, -6)
  })
  MeshRenderer.setCylinder(leverHandle)
  Material.setPbrMaterial(leverHandle, plastic('#d0d8e4', 0.2))

  // --- Body sitting in the bowl ---
  // Thighs — skin tone; cylinder height is Y, rotate 90° on X to lay flat forward
  const thighLen = 1.05
  const thighY = 1.55
  const thighZ = 1.15
  const kneeZ = thighZ + thighLen * 0.5
  const thighXs = [-0.357, 0.357] as const

  for (const x of thighXs) {
    const thigh = engine.addEntity()
    Transform.create(thigh, {
      parent: bossRoot,
      position: Vector3.create(x, thighY, thighZ),
      scale: Vector3.create(0.4, thighLen, 0.4),
      rotation: Quaternion.fromEulerDegrees(90, 0, x < 0 ? -6 : 6)
    })
    MeshRenderer.setCylinder(thigh)
    Material.setPbrMaterial(thigh, skin)

    // Shin hangs from the knee (forward tip of the thigh)
    const shinLen = 0.75
    const shin = engine.addEntity()
    Transform.create(shin, {
      parent: bossRoot,
      position: Vector3.create(x, thighY - shinLen * 0.5, kneeZ),
      scale: Vector3.create(0.32, shinLen, 0.32)
    })
    MeshRenderer.setCylinder(shin)
    Material.setPbrMaterial(shin, pants)

    // Foot at the bottom of the shin
    const foot = engine.addEntity()
    Transform.create(foot, {
      parent: bossRoot,
      position: Vector3.create(x, thighY - shinLen - 0.08, kneeZ + 0.12),
      scale: Vector3.create(0.34, 0.16, 0.52)
    })
    MeshRenderer.setBox(foot)
    Material.setPbrMaterial(foot, solid('#111018', 0.7))
  }

  // Pants-colored bridge connecting the knees (flat bar along X)
  const kneeBridge = engine.addEntity()
  Transform.create(kneeBridge, {
    parent: bossRoot,
    position: Vector3.create(0, thighY, kneeZ),
    scale: Vector3.create(0.8, 0.32, 0.4)
  })
  MeshRenderer.setBox(kneeBridge)
  Material.setPbrMaterial(kneeBridge, pants)

  // Torso upright
  const torso = engine.addEntity()
  Transform.create(torso, {
    parent: bossRoot,
    position: Vector3.create(0, 2.15, 0.05),
    scale: Vector3.create(1.15, 1.35, 0.7)
  })
  MeshRenderer.setBox(torso)
  Material.setPbrMaterial(torso, shirt)

  // Shoulder pivots (arms parented here so they wave from the shoulder)
  bossShoulderL = engine.addEntity()
  Transform.create(bossShoulderL, {
    parent: bossRoot,
    position: Vector3.create(-0.75, 2.7, 0.05)
  })
  bossShoulderR = engine.addEntity()
  Transform.create(bossShoulderR, {
    parent: bossRoot,
    position: Vector3.create(0.75, 2.7, 0.05)
  })

  const armPivots: Array<{ pivot: Entity; side: number }> = [
    { pivot: bossShoulderL, side: -1 },
    { pivot: bossShoulderR, side: 1 }
  ]

  for (const { pivot, side } of armPivots) {
    const shoulderBall = engine.addEntity()
    Transform.create(shoulderBall, {
      parent: pivot,
      position: Vector3.create(0, 0, 0),
      scale: Vector3.create(0.45, 0.4, 0.45)
    })
    MeshRenderer.setSphere(shoulderBall)
    Material.setPbrMaterial(shoulderBall, shirt)

    // Arm extends upward from the shoulder pivot
    const armLen = 1.0
    const arm = engine.addEntity()
    Transform.create(arm, {
      parent: pivot,
      position: Vector3.create(0, armLen * 0.55, 0),
      scale: Vector3.create(0.32, armLen, 0.32)
    })
    MeshRenderer.setCylinder(arm)
    Material.setPbrMaterial(arm, skin)

    // Hand at the wrist (end of the arm)
    const hand = engine.addEntity()
    Transform.create(hand, {
      parent: pivot,
      position: Vector3.create(0, armLen * 1.05, 0)
    })

    // Palm
    const palm = engine.addEntity()
    Transform.create(palm, {
      parent: hand,
      position: Vector3.create(0, 0.12, 0.02),
      scale: Vector3.create(0.38, 0.28, 0.14)
    })
    MeshRenderer.setBox(palm)
    Material.setPbrMaterial(palm, skin)

    // Wrist nub
    const wrist = engine.addEntity()
    Transform.create(wrist, {
      parent: hand,
      position: Vector3.create(0, 0, 0),
      scale: Vector3.create(0.22, 0.14, 0.18)
    })
    MeshRenderer.setSphere(wrist)
    Material.setPbrMaterial(wrist, skin)

    // Four fingers
    const fingerXs = [-0.14, -0.05, 0.05, 0.14]
    for (let i = 0; i < fingerXs.length; i++) {
      const finger = engine.addEntity()
      Transform.create(finger, {
        parent: hand,
        position: Vector3.create(fingerXs[i], 0.32, 0.02),
        scale: Vector3.create(0.07, 0.28 + (i === 1 || i === 2 ? 0.04 : 0), 0.07)
      })
      MeshRenderer.setCylinder(finger)
      Material.setPbrMaterial(finger, skin)

      const tip = engine.addEntity()
      Transform.create(tip, {
        parent: finger,
        position: Vector3.create(0, 0.55, 0),
        scale: Vector3.create(1.1, 0.35, 1.1)
      })
      MeshRenderer.setSphere(tip)
      Material.setPbrMaterial(tip, skin)
    }

    // Thumb — angled out from the inner side of the palm
    const thumb = engine.addEntity()
    Transform.create(thumb, {
      parent: hand,
      position: Vector3.create(side * -0.2, 0.14, 0.06),
      scale: Vector3.create(0.08, 0.22, 0.08),
      rotation: Quaternion.fromEulerDegrees(20, 0, side * -50)
    })
    MeshRenderer.setCylinder(thumb)
    Material.setPbrMaterial(thumb, skin)

    const thumbTip = engine.addEntity()
    Transform.create(thumbTip, {
      parent: thumb,
      position: Vector3.create(0, 0.55, 0),
      scale: Vector3.create(1.15, 0.4, 1.15)
    })
    MeshRenderer.setSphere(thumbTip)
    Material.setPbrMaterial(thumbTip, skin)
  }

  // Neck
  const neck = engine.addEntity()
  Transform.create(neck, {
    parent: bossRoot,
    position: Vector3.create(0, 2.95, 0.08),
    scale: Vector3.create(0.4, 0.35, 0.4)
  })
  MeshRenderer.setCylinder(neck)
  Material.setPbrMaterial(neck, skin)

  // Head — faces with body; jaw chomps separately
  bossHead = engine.addEntity()
  Transform.create(bossHead, {
    parent: bossRoot,
    position: Vector3.create(0, 3.45, 0.12),
    scale: Vector3.create(1.15, 1.15, 1.15)
  })
  MeshRenderer.setSphere(bossHead)
  Material.setPbrMaterial(bossHead, skin)

  for (const x of [-0.28, 0.28]) {
    const eye = engine.addEntity()
    Transform.create(eye, {
      parent: bossHead,
      position: Vector3.create(x, 0.12, 0.42),
      scale: Vector3.create(0.28, 0.22, 0.14)
    })
    MeshRenderer.setSphere(eye)
    Material.setPbrMaterial(eye, solid('#0a0505', 0.95))

    const pupil = engine.addEntity()
    Transform.create(pupil, {
      parent: eye,
      position: Vector3.create(0, 0, 0.45),
      scale: Vector3.create(0.45, 0.4, 0.4)
    })
    MeshRenderer.setSphere(pupil)
    Material.setPbrMaterial(pupil, glow('#ff2244', 3.2))
  }

  // Dark mouth cavity
  bossMouthHole = engine.addEntity()
  Transform.create(bossMouthHole, {
    parent: bossHead,
    position: Vector3.create(0, -0.22, 0.38),
    scale: Vector3.create(0.55, 0.22, 0.28)
  })
  MeshRenderer.setBox(bossMouthHole)
  Material.setPbrMaterial(bossMouthHole, solid('#120508', 0.95))

  // Upper teeth / lip
  bossJawUpper = engine.addEntity()
  Transform.create(bossJawUpper, {
    parent: bossHead,
    position: Vector3.create(0, -0.12, 0.48),
    scale: Vector3.create(0.52, 0.12, 0.18)
  })
  MeshRenderer.setBox(bossJawUpper)
  Material.setPbrMaterial(bossJawUpper, plastic('#f0e8dc', 0.35))

  for (const x of [-0.18, -0.06, 0.06, 0.18]) {
    const tooth = engine.addEntity()
    Transform.create(tooth, {
      parent: bossJawUpper,
      position: Vector3.create(x / 0.52, -0.7, 0.2),
      scale: Vector3.create(0.12, 0.9, 0.35)
    })
    MeshRenderer.setBox(tooth)
    Material.setPbrMaterial(tooth, plastic('#fff6ea', 0.3))
  }

  // Lower jaw — animated chomp
  bossJawLower = engine.addEntity()
  Transform.create(bossJawLower, {
    parent: bossHead,
    position: Vector3.create(0, -0.35, 0.42),
    scale: Vector3.create(0.5, 0.14, 0.22)
  })
  MeshRenderer.setBox(bossJawLower)
  Material.setPbrMaterial(bossJawLower, plastic('#e8a888', 0.45))

  for (const x of [-0.16, -0.05, 0.05, 0.16]) {
    const tooth = engine.addEntity()
    Transform.create(tooth, {
      parent: bossJawLower,
      position: Vector3.create(x / 0.5, 0.65, 0.15),
      scale: Vector3.create(0.12, 0.7, 0.3)
    })
    MeshRenderer.setBox(tooth)
    Material.setPbrMaterial(tooth, plastic('#fff6ea', 0.3))
  }

  // Messy hair
  const hair = engine.addEntity()
  Transform.create(hair, {
    parent: bossHead,
    position: Vector3.create(0, 0.35, -0.1),
    scale: Vector3.create(1.05, 0.55, 0.95)
  })
  MeshRenderer.setSphere(hair)
  Material.setPbrMaterial(hair, solid('#1a1018', 0.75))
}

export function pulseOhioZone(active: boolean) {
  for (const tile of floorTiles) {
    if (!tileInOhio(tile.x, tile.z)) continue
    paintFloorTile(tile, true, active)
  }
}

/** Rotate boss toward the player (yaw only) and chomp the jaw. */
export function animateBoss(dt: number) {
  if (!bossRoot || !Transform.has(bossRoot)) return

  const bossT = Transform.getMutable(bossRoot)
  if (Transform.has(engine.PlayerEntity)) {
    const player = Transform.get(engine.PlayerEntity).position
    const dx = player.x - bossT.position.x
    const dz = player.z - bossT.position.z
    if (dx * dx + dz * dz > 0.01) {
      const yaw = (Math.atan2(dx, dz) * 180) / Math.PI
      bossT.rotation = Quaternion.fromEulerDegrees(0, yaw, 0)
    }
  }

  // Keep head locked forward on the body (no spin)
  if (bossHead && Transform.has(bossHead)) {
    Transform.getMutable(bossHead).rotation = Quaternion.fromEulerDegrees(0, 0, 0)
  }

  // Chomp: fast open/close
  bossChompPhase += dt * 10
  const open = 0.5 + 0.5 * Math.sin(bossChompPhase) // 0..1

  if (bossJawLower && Transform.has(bossJawLower)) {
    const jaw = Transform.getMutable(bossJawLower)
    jaw.position = Vector3.create(0, -0.35 - open * 0.22, 0.42 + open * 0.04)
    jaw.rotation = Quaternion.fromEulerDegrees(open * 42, 0, 0)
  }

  if (bossJawUpper && Transform.has(bossJawUpper)) {
    const upper = Transform.getMutable(bossJawUpper)
    upper.position = Vector3.create(0, -0.12 + open * 0.04, 0.48)
    upper.rotation = Quaternion.fromEulerDegrees(-open * 12, 0, 0)
  }

  if (bossMouthHole && Transform.has(bossMouthHole)) {
    const hole = Transform.getMutable(bossMouthHole)
    hole.scale = Vector3.create(0.55, 0.16 + open * 0.38, 0.28)
    hole.position = Vector3.create(0, -0.22 - open * 0.08, 0.38)
  }

  // Arms wave from the shoulders — frantic "help" flail
  bossWavePhase += dt * 5.5
  const wave = Math.sin(bossWavePhase)
  const wave2 = Math.sin(bossWavePhase + 0.8)

  if (bossShoulderL && Transform.has(bossShoulderL)) {
    Transform.getMutable(bossShoulderL).rotation = Quaternion.fromEulerDegrees(
      -25 + wave * 18,
      wave2 * 12,
      35 + wave * 28
    )
  }
  if (bossShoulderR && Transform.has(bossShoulderR)) {
    Transform.getMutable(bossShoulderR).rotation = Quaternion.fromEulerDegrees(
      -25 + wave2 * 18,
      -wave * 12,
      -35 - wave2 * 28
    )
  }
}
