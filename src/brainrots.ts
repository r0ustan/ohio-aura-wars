import {
  ColliderLayer,
  engine,
  Entity,
  MeshCollider,
  Schemas,
  Transform
} from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { addAura, gameState } from './gameState'
import { BrainrotKind, buildCharacterVisual, KIND_META } from './characters'
import { lightningSystem, spawnLightningWarning } from './lightningStrike'
import { mistBurstSystem, spawnMistBurst } from './mistBurst'
import { scorePopupSystem, spawnScorePopup } from './scorePopup'
import { playScoreSfx, sfxSystem } from './sfxPlayer'
import { flingFanumBodyParts, sigmaBlastSystem, spawnSigmaEnemyBlast } from './sigmaBlast'
import { isSigmaInvincible, startSigmaTrail } from './sigmaTrail'

export type { BrainrotKind }

export const Brainrot = engine.defineComponent('brainrot-target', {
  kind: Schemas.String,
  bobPhase: Schemas.Number,
  bobSpeed: Schemas.Number,
  wobble: Schemas.Number,
  lifetime: Schemas.Number,
  value: Schemas.Number,
  good: Schemas.Boolean,
  /** Seconds until a positive character tries to spawn another (unused for Fanums) */
  replicateIn: Schemas.Number
})

/** Simulated slide physics for tax collectors (SDK has no rigidbodies for scene entities). */
export const BrainrotMotion = engine.defineComponent('brainrot-motion', {
  vx: Schemas.Number,
  vz: Schemas.Number,
  taxCooldown: Schemas.Number,
  /** Seconds until this tax collector tries to spawn another */
  replicateIn: Schemas.Number
})

const active = new Set<Entity>()
/** Tracked mesh/collider children per root — avoids full-scene destroy scans. */
const treeParts = new Map<Entity, Entity[]>()
const PICKUP_RADIUS = 1.85
const BUMP_RADIUS = 2.1
/** Player feet above this = cleared the Fanum (double-jump safe) */
const FANUM_CLEAR_HEIGHT = 1.35
const MAX_SLIDE_SPEED = 8
const FRICTION = 2.8
/** Soft min distance so Fanum physics boxes don't dig into the avatar (yeets) */
const FANUM_MIN_SEP = 1.25
const ARENA_MIN = 3
const ARENA_MAX = 45
/** Goods still capped; Fanums never stop spawning (oldest recycled past soft cap). */
const MAX_GOOD_DESKTOP = 16
const MAX_GOOD_MOBILE = 8
const FANUM_SOFT_CAP_DESKTOP = 40
const FANUM_SOFT_CAP_MOBILE = 12
/** Start creeping toward a player inside this range */
const CHASE_RADIUS = 15
/** Soft accel toward nearest player (balances FRICTION → ~1.2 u/s crawl) */
const CHASE_ACCEL = 3.4
const CHASE_MAX_SPEED = 1.35
/** Extra swarm when the player is idle (multiplies accel / max speed) */
const STILL_SWARM_ACCEL = 3.2
const STILL_SWARM_MAX = 4.2
/** Horizontal speed above this counts as fully moving (no swarm bonus) */
const PLAYER_STILL_REF = 3.2

function maxGood() {
  return isMobile() ? MAX_GOOD_MOBILE : MAX_GOOD_DESKTOP
}

function fanumSoftCap() {
  return isMobile() ? FANUM_SOFT_CAP_MOBILE : FANUM_SOFT_CAP_DESKTOP
}

/** Positive characters only — Fanums use a fixed global timer instead */
const MULTIPLY_RAMP_INTERVAL = 15
const MAX_MULTIPLY_SPEED_DESKTOP = 64
const MAX_MULTIPLY_SPEED_MOBILE = 8
let multiplySpeed = 1
let multiplyRampTimer = MULTIPLY_RAMP_INTERVAL

/** Steady Fanum cadence: one every ~1s (±1s); mobile ~2.2s (±1.2s) */
let fanumSpawnTimer = 1
const FANUM_SPAWN_BASE = 1
const FANUM_SPAWN_JITTER = 1
const FANUM_SPAWN_BASE_MOBILE = 2.2
const FANUM_SPAWN_JITTER_MOBILE = 1.2

/** Goods spawn at half Fanum frequency: every ~2s (±2s) */
let goodSpawnTimer = 2

let lastPlayerX = 24
let lastPlayerZ = 24

type PendingFanum = { x: number; z: number; ttl: number }
const pendingFanums: PendingFanum[] = []
const FANUM_WARN_DELAY = 0.42

function nextFanumInterval() {
  if (isMobile()) {
    return Math.max(
      0.8,
      FANUM_SPAWN_BASE_MOBILE + (Math.random() * 2 - 1) * FANUM_SPAWN_JITTER_MOBILE
    )
  }
  return Math.max(0.25, FANUM_SPAWN_BASE + (Math.random() * 2 - 1) * FANUM_SPAWN_JITTER)
}

function nextGoodInterval() {
  const base = isMobile() ? FANUM_SPAWN_BASE_MOBILE * 2 : FANUM_SPAWN_BASE * 2
  const jitter = isMobile() ? FANUM_SPAWN_JITTER_MOBILE * 2 : FANUM_SPAWN_JITTER * 2
  return Math.max(isMobile() ? 1.2 : 0.5, base + (Math.random() * 2 - 1) * jitter)
}

export function resetFanumSpawner() {
  fanumSpawnTimer = nextFanumInterval()
}

export function resetGoodSpawner() {
  goodSpawnTimer = nextGoodInterval()
}

export function resetMultiplyRamp() {
  multiplySpeed = 1
  multiplyRampTimer = MULTIPLY_RAMP_INTERVAL
  resetFanumSpawner()
  resetGoodSpawner()
}

function tickMultiplyRamp(dt: number) {
  if (gameState.phase !== 'playing') return
  multiplyRampTimer -= dt
  if (multiplyRampTimer > 0) return
  multiplyRampTimer = MULTIPLY_RAMP_INTERVAL
  const maxSpeed = isMobile() ? MAX_MULTIPLY_SPEED_MOBILE : MAX_MULTIPLY_SPEED_DESKTOP
  if (multiplySpeed >= maxSpeed) return
  multiplySpeed = Math.min(maxSpeed, multiplySpeed * 2)
  gameState.chaos = { text: `MULTIPLY x${multiplySpeed}`, ttl: 1.8 }
  gameState.announcementFlash = 0.35
}

function tickFanumSpawner(dt: number) {
  if (gameState.phase !== 'playing') return
  fanumSpawnTimer -= dt
  if (fanumSpawnTimer > 0) return
  fanumSpawnTimer = nextFanumInterval()
  scheduleFanumSpawn()
}

function tickGoodSpawner(dt: number) {
  if (gameState.phase !== 'playing') return
  goodSpawnTimer -= dt
  if (goodSpawnTimer > 0) return
  goodSpawnTimer = nextGoodInterval()
  if (getGoodCount() < maxGood()) {
    spawnBrainrot(pickGoodKind())
  }
}

function pickKind(): BrainrotKind {
  const entries = Object.entries(KIND_META) as [BrainrotKind, (typeof KIND_META)[BrainrotKind]][]
  const total = entries.reduce((s, [, k]) => s + k.weight, 0)
  let roll = Math.random() * total
  for (const [kind, cfg] of entries) {
    roll -= cfg.weight
    if (roll <= 0) return kind
  }
  return 'rizz'
}

function pickGoodKind(): BrainrotKind {
  const entries = (Object.entries(KIND_META) as [BrainrotKind, (typeof KIND_META)[BrainrotKind]][]).filter(
    ([, k]) => k.good
  )
  const total = entries.reduce((s, [, k]) => s + k.weight, 0)
  let roll = Math.random() * total
  for (const [kind, cfg] of entries) {
    roll -= cfg.weight
    if (roll <= 0) return kind
  }
  return 'rizz'
}

function randomArenaPos() {
  const x = 8 + Math.random() * 32
  const z = 8 + Math.random() * 32
  if (Math.abs(x - 24) < 4 && Math.abs(z - 24) < 4) {
    return Vector3.create(x + 6, 0, z + 4)
  }
  return Vector3.create(x, 0, z)
}

/** Remove root and every recorded child (fallback: scene scan). */
function destroyBrainrotTree(root: Entity) {
  const parts = treeParts.get(root)
  if (parts) {
    for (const e of parts) engine.removeEntity(e)
    treeParts.delete(root)
  } else {
    const toRemove: Entity[] = []
    for (const [entity, transform] of engine.getEntitiesWith(Transform)) {
      let p: Entity | undefined = transform.parent
      let guard = 0
      while (p !== undefined && guard++ < 16) {
        if (p === root) {
          toRemove.push(entity)
          break
        }
        if (!Transform.has(p)) break
        p = Transform.get(p).parent
      }
    }
    for (const e of toRemove) engine.removeEntity(e)
  }
  active.delete(root)
  engine.removeEntity(root)
}

export function clearBrainrots() {
  for (const e of Array.from(active)) {
    destroyBrainrotTree(e)
  }
  active.clear()
  treeParts.clear()
  pendingFanums.length = 0
}

function addBadCollider(root: Entity, parts: Entity[]) {
  // Short torso-height hitbox so a double-jump clears it
  const collider = engine.addEntity()
  Transform.create(collider, {
    parent: root,
    position: Vector3.create(0, 0.55, 0),
    scale: Vector3.create(0.85, 1.05, 0.85)
  })
  MeshCollider.setBox(collider, ColliderLayer.CL_PHYSICS)
  parts.push(collider)
}

/** Positive multiply cadence (secondary to global good spawner) */
function nextGoodReplicateDelay() {
  const good = getGoodCount()
  return Math.max(2.5, 5 - good * 0.15) + Math.random() * 1.5
}

function destroyOldestFanum() {
  let oldest: Entity | null = null
  for (const e of active) {
    if (!Brainrot.has(e) || Brainrot.get(e).good) continue
    oldest = e
    break
  }
  if (oldest) destroyBrainrotTree(oldest)
}

/** Keep Fanum count under soft cap so spawns (and lightning) never hard-stop. */
function makeRoomForFanum() {
  while (getBadCount() >= fanumSoftCap()) {
    destroyOldestFanum()
  }
}

function tickPendingFanums(dt: number) {
  for (let i = pendingFanums.length - 1; i >= 0; i--) {
    pendingFanums[i].ttl -= dt
    if (pendingFanums[i].ttl > 0) continue
    const p = pendingFanums[i]
    pendingFanums.splice(i, 1)
    spawnBrainrot('fanum', Vector3.create(p.x, 0, p.z), { skipWarning: true })
  }
}

/** Warn with lightning, then spawn Fanum after a short delay. Never capped out. */
function scheduleFanumSpawn(at?: Vector3) {
  if (gameState.phase !== 'playing') return

  const pos = at ?? randomArenaPos()
  spawnLightningWarning(pos)
  pendingFanums.push({ x: pos.x, z: pos.z, ttl: FANUM_WARN_DELAY })
}

export function spawnBrainrot(
  forced?: BrainrotKind,
  at?: Vector3,
  opts?: { skipWarning?: boolean }
) {
  if (gameState.phase !== 'playing') return

  const kind = forced ?? pickKind()
  const meta = KIND_META[kind]

  // Goods capped by good count only — Fanums must not block positive spawns
  if (meta.good) {
    if (getGoodCount() >= maxGood()) return
  } else {
    makeRoomForFanum()
  }

  // Fanums telegraph with a lightning strike before appearing
  if (!meta.good && !opts?.skipWarning) {
    scheduleFanumSpawn(at)
    return
  }

  const pos = at ?? randomArenaPos()

  const root = engine.addEntity()
  Transform.create(root, {
    position: Vector3.create(pos.x, 0, pos.z)
  })

  const visual = engine.addEntity()
  Transform.create(visual, {
    parent: root,
    position: Vector3.create(0, 0, 0)
  })
  const parts: Entity[] = [visual]
  buildCharacterVisual(kind, visual, parts)
  treeParts.set(root, parts)

  Brainrot.create(root, {
    kind,
    bobPhase: Math.random() * Math.PI * 2,
    bobSpeed: meta.good ? 2.2 + Math.random() : 4 + Math.random() * 2,
    wobble: meta.good ? 8 : 35,
    // Bad linger forever; goods stay long enough to multiply once or twice
    lifetime: meta.good ? 14 + Math.random() * 5 : 99999,
    value: meta.value,
    good: meta.good,
    replicateIn: meta.good ? nextGoodReplicateDelay() : 0
  })

  if (!meta.good) {
    BrainrotMotion.create(root, {
      vx: 0,
      vz: 0,
      taxCooldown: 0,
      replicateIn: 0
    })
  }

  active.add(root)
  return root
}

/** Local player only — each client runs their own solo match. */
function localPlayerPos(): Vector3 | null {
  if (!Transform.has(engine.PlayerEntity)) return null
  return Transform.get(engine.PlayerEntity).position
}

function collectGoodBrainrot(entity: Entity) {
  if (gameState.phase !== 'playing') return
  if (!Brainrot.has(entity)) return
  if (!active.has(entity)) return

  const data = Brainrot.get(entity)
  if (!data.good) return

  const kind = data.kind as BrainrotKind
  gameState.hits += 1
  gameState.combo += 1
  gameState.comboTimer = 1.6
  const gained = addAura(data.value)
  if (kind === 'sigma') {
    gameState.multiplier = 2.5
    gameState.multiplierTimer = 5
    gameState.chaos = { text: 'SIGMA BOOST', ttl: 1.6 }
    gameState.announcementFlash = 0.25
    startSigmaTrail(5)
  }

  const pos = Transform.get(entity).position
  spawnScorePopup(pos, gained, true)
  playScoreSfx()
  spawnMistBurst(pos, kind, true)
  destroyBrainrotTree(entity)
}

function explodeBadWithSigma(entity: Entity) {
  if (!Brainrot.has(entity) || !active.has(entity)) return

  const rootT = Transform.get(entity)
  const blastAt = Vector3.create(rootT.position.x, rootT.position.y, rootT.position.z)
  const player = localPlayerPos()
  const toward = player
    ? Vector3.create(player.x, player.y + 1.35, player.z)
    : Vector3.create(blastAt.x, blastAt.y + 1.5, blastAt.z)

  const parts = treeParts.get(entity) ?? []
  treeParts.delete(entity)
  active.delete(entity)

  // Detach meshes first so removing the root doesn't wipe them
  flingFanumBodyParts(parts, rootT.position, rootT.rotation, toward)
  engine.removeEntity(entity)

  spawnSigmaEnemyBlast(blastAt)
  gameState.hits += 1
  gameState.combo += 1
  gameState.comboTimer = 1.6
  gameState.chaos = { text: 'VAPORIZED!', ttl: 1.1 }
  gameState.announcementFlash = 0.2
}

function taxAndPushBad(entity: Entity, playerPos: Vector3, playerVx: number, playerVz: number) {
  // Sigma boost: Fanums explode on contact (boss Skibidi still taxes separately)
  if (isSigmaInvincible()) {
    explodeBadWithSigma(entity)
    return
  }

  const data = Brainrot.get(entity)
  const motion = BrainrotMotion.getMutable(entity)
  const t = Transform.getMutable(entity)

  let awayX = t.position.x - playerPos.x
  let awayZ = t.position.z - playerPos.z
  let len = Math.sqrt(awayX * awayX + awayZ * awayZ)
  if (len < 0.05) {
    // Player overlapping center — use their movement, or a random shove
    const pSpeed = Math.sqrt(playerVx * playerVx + playerVz * playerVz)
    if (pSpeed > 0.2) {
      awayX = playerVx
      awayZ = playerVz
      len = pSpeed
    } else {
      const a = Math.random() * Math.PI * 2
      awayX = Math.cos(a)
      awayZ = Math.sin(a)
      len = 1
    }
  }
  const nx = awayX / len
  const nz = awayZ / len

  // Keep a soft gap so the kinematic collider doesn't penetrate the avatar
  if (len < FANUM_MIN_SEP) {
    t.position.x = playerPos.x + nx * FANUM_MIN_SEP
    t.position.z = playerPos.z + nz * FANUM_MIN_SEP
  }

  const playerSpeed = Math.sqrt(playerVx * playerVx + playerVz * playerVz)
  // How hard the player is running into them (toward the character)
  const intoThem = Math.max(0, -(playerVx * nx + playerVz * nz))
  // Mild shove — hard kinematic slides were launching players out of the arena
  const desiredOut = 3.2 + playerSpeed * 0.35 + intoThem * 0.45
  const currentOut = motion.vx * nx + motion.vz * nz
  if (desiredOut > currentOut) {
    const add = desiredOut - currentOut
    motion.vx += nx * add
    motion.vz += nz * add
  }

  const speed = Math.sqrt(motion.vx * motion.vx + motion.vz * motion.vz)
  if (speed > MAX_SLIDE_SPEED) {
    const s = MAX_SLIDE_SPEED / speed
    motion.vx *= s
    motion.vz *= s
  }

  if (motion.taxCooldown <= 0) {
    motion.taxCooldown = 1.35
    gameState.taxes += 1
    gameState.combo = 0
    gameState.comboTimer = 0
    const lost = addAura(data.value)
    gameState.chaos = { text: 'TAXED!', ttl: 1.4 }
    gameState.announcementFlash = 0.25
    spawnScorePopup(t.position, lost, false)
    playScoreSfx()
    spawnMistBurst(
      Vector3.create(t.position.x, t.position.y + 0.8, t.position.z),
      data.kind as BrainrotKind,
      false
    )
  }
}

function playerNear(pos: Vector3, radius: number): boolean {
  if (!Transform.has(engine.PlayerEntity)) return false
  const p = Transform.get(engine.PlayerEntity).position
  const dx = p.x - pos.x
  const dz = p.z - pos.z
  return dx * dx + dz * dz <= radius * radius
}

/** Ground-level Fanum contact only — jumping over skips the tax. */
function playerTouchingFanum(fanumPos: Vector3): boolean {
  if (!Transform.has(engine.PlayerEntity)) return false
  const p = Transform.get(engine.PlayerEntity).position
  if (p.y > FANUM_CLEAR_HEIGHT) return false
  const dx = p.x - fanumPos.x
  const dz = p.z - fanumPos.z
  return dx * dx + dz * dz <= BUMP_RADIUS * BUMP_RADIUS
}

function clampArena(t: { position: { x: number; z: number } }, motion: { vx: number; vz: number }) {
  if (t.position.x < ARENA_MIN) {
    t.position.x = ARENA_MIN
    motion.vx = Math.abs(motion.vx) * 0.55
  } else if (t.position.x > ARENA_MAX) {
    t.position.x = ARENA_MAX
    motion.vx = -Math.abs(motion.vx) * 0.55
  }
  if (t.position.z < ARENA_MIN) {
    t.position.z = ARENA_MIN
    motion.vz = Math.abs(motion.vz) * 0.55
  } else if (t.position.z > ARENA_MAX) {
    t.position.z = ARENA_MAX
    motion.vz = -Math.abs(motion.vz) * 0.55
  }
}

export function brainrotSystem(dt: number) {
  mistBurstSystem(dt)
  sigmaBlastSystem(dt)
  lightningSystem(dt)
  scorePopupSystem(dt)
  sfxSystem(dt)
  tickPendingFanums(dt)
  tickFanumSpawner(dt)
  tickGoodSpawner(dt)
  tickMultiplyRamp(dt)

  let playerVx = 0
  let playerVz = 0
  let playerPos = Vector3.create(24, 0, 24)
  if (Transform.has(engine.PlayerEntity)) {
    playerPos = Transform.get(engine.PlayerEntity).position
    if (dt > 0.0001) {
      playerVx = (playerPos.x - lastPlayerX) / dt
      playerVz = (playerPos.z - lastPlayerZ) / dt
    }
    lastPlayerX = playerPos.x
    lastPlayerZ = playerPos.z
  }

  const toCollect: Entity[] = []
  const damp = Math.exp(-FRICTION * dt)
  const goodReplicateDt = dt * multiplySpeed
  const playerMoveSpeed = Math.sqrt(playerVx * playerVx + playerVz * playerVz)
  const stillFactor = Math.max(0, 1 - playerMoveSpeed / PLAYER_STILL_REF)
  const chaseAccel = CHASE_ACCEL * (1 + stillFactor * STILL_SWARM_ACCEL)
  const chaseMax = CHASE_MAX_SPEED * (1 + stillFactor * STILL_SWARM_MAX)
  const chaseRange = CHASE_RADIUS + stillFactor * 6

  for (const [entity] of engine.getEntitiesWith(Brainrot, Transform)) {
    if (!active.has(entity)) continue
    const mutable = Brainrot.getMutable(entity)
    mutable.lifetime -= dt
    mutable.bobPhase += dt * mutable.bobSpeed

    const t = Transform.getMutable(entity)

    if (mutable.good) {
      t.position.y = 0.08 + Math.abs(Math.sin(mutable.bobPhase)) * 0.25
      // Faces are built on +Z — yaw root toward the player so eyes stay visible
      const player = localPlayerPos()
      if (player) {
        const dx = player.x - t.position.x
        const dz = player.z - t.position.z
        t.rotation = Quaternion.fromEulerDegrees(0, (Math.atan2(dx, dz) * 180) / Math.PI, 0)
      }

      // Positive characters multiply on their own cadence
      if (gameState.phase === 'playing') {
        mutable.replicateIn -= goodReplicateDt
        if (mutable.replicateIn <= 0) {
          mutable.replicateIn = nextGoodReplicateDelay()
          if (getGoodCount() < maxGood() && Math.random() < 0.8) {
            spawnBrainrot(pickGoodKind())
          }
        }
      }

      if (gameState.phase === 'playing' && playerNear(t.position, PICKUP_RADIUS)) {
        toCollect.push(entity)
        continue
      }
    } else if (BrainrotMotion.has(entity)) {
      const motion = BrainrotMotion.getMutable(entity)
      if (motion.taxCooldown > 0) motion.taxCooldown -= dt

      // Creep toward local player only (skip if being shoved hard)
      const nearest = localPlayerPos()
      let chasing = false
      let chaseYaw: number | null = null
      if (nearest && gameState.phase === 'playing') {
        const dx = nearest.x - t.position.x
        const dz = nearest.z - t.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        const slideNow = Math.sqrt(motion.vx * motion.vx + motion.vz * motion.vz)
        if (dist > 1.0 && dist < chaseRange && slideNow < chaseMax + 2.5) {
          chasing = true
          const nx = dx / dist
          const nz = dz / dist
          motion.vx += nx * chaseAccel * dt
          motion.vz += nz * chaseAccel * dt
          chaseYaw = (Math.atan2(nx, nz) * 180) / Math.PI

          const after = Math.sqrt(motion.vx * motion.vx + motion.vz * motion.vz)
          if (after > chaseMax && slideNow < chaseMax + 0.5) {
            const s = chaseMax / after
            motion.vx *= s
            motion.vz *= s
          }
        }
      }

      // Slide integration
      t.position.x += motion.vx * dt
      t.position.z += motion.vz * dt
      motion.vx *= damp
      motion.vz *= damp
      if (Math.abs(motion.vx) < 0.05) motion.vx = 0
      if (Math.abs(motion.vz) < 0.05) motion.vz = 0
      clampArena(t, motion)

      const slideSpeed = Math.sqrt(motion.vx * motion.vx + motion.vz * motion.vz)
      t.position.y = 0.08 + Math.abs(Math.sin(mutable.bobPhase)) * (slideSpeed > 1 ? 0.06 : 0.15)
      t.rotation = Quaternion.fromEulerDegrees(
        Math.sin(mutable.bobPhase * 3) * 6,
        chaseYaw !== null
          ? chaseYaw
          : slideSpeed > 0.5
            ? (Math.atan2(motion.vx, motion.vz) * 180) / Math.PI
            : Math.sin(mutable.bobPhase) * mutable.wobble,
        Math.cos(mutable.bobPhase * 2) * (chasing ? 2 : 4)
      )

      if (gameState.phase === 'playing' && playerTouchingFanum(t.position)) {
        taxAndPushBad(entity, playerPos, playerVx, playerVz)
      }
    }

    if (mutable.good && mutable.lifetime <= 0) {
      destroyBrainrotTree(entity)
    }
  }

  for (const entity of toCollect) {
    collectGoodBrainrot(entity)
  }
}

export function getActiveCount() {
  return active.size
}

export function getBadCount() {
  let n = 0
  for (const e of active) {
    if (Brainrot.has(e) && !Brainrot.get(e).good) n++
  }
  return n
}

export function getGoodCount() {
  let n = 0
  for (const e of active) {
    if (Brainrot.has(e) && Brainrot.get(e).good) n++
  }
  return n
}
