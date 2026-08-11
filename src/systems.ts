import { engine, TextShape, Transform } from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo, triggerEmote } from '~system/RestrictedActions'
import {
  ARENA_CENTER,
  floorTileSystem,
  getBossEntity,
  getScoreboard,
  OHIO_ZONE_CENTER,
  OHIO_ZONE_RADIUS,
  pulseOhioZone,
  animateBoss,
  relocateOhioZone,
  setStartControlsVisible,
  tickBonusPad,
  tickOhioZoneRelocation,
  tickWallLights
} from './arena'
import {
  brainrotSystem,
  clearBrainrots,
  resetMultiplyRamp,
  spawnBrainrot
} from './brainrots'
import {
  addAura,
  CHAOS_LINES,
  COMBO_WINDOW,
  endRound,
  gameState,
  GYATT_COOLDOWN,
  GYATT_POWER,
  isBankrupt,
  resetRound,
  STARTING_AURA
} from './gameState'
import { submitRunScore, tickLeaderboard } from './leaderboard'
import { startGameMusic, stopGameMusic, tickGameMusic } from './musicPlayer'
import { spawnScorePopup } from './scorePopup'
import { playAmogusSfx, playBonusSfx, playPriceIsWrongSfx, playScoreSfx } from './sfxPlayer'
import { startSigmaTrail, stopSigmaTrail, tickSigmaTrail, isSigmaInvincible } from './sigmaTrail'

let chaosTimer = 0
let bossAngle = 0
let bossTaxCooldown = 0
let containCooldown = 0

/** Soft clamp if physics yeets the avatar past the walls / into the sky */
const PLAYER_ARENA_MIN = 1.6
const PLAYER_ARENA_MAX = 46.4
const PLAYER_MAX_Y = 10

function containPlayerInArena(dt: number) {
  containCooldown = Math.max(0, containCooldown - dt)
  if (containCooldown > 0) return
  if (!Transform.has(engine.PlayerEntity)) return

  const p = Transform.get(engine.PlayerEntity).position
  let x = p.x
  let y = p.y
  let z = p.z
  let fix = false

  if (x < PLAYER_ARENA_MIN) {
    x = PLAYER_ARENA_MIN + 0.8
    fix = true
  } else if (x > PLAYER_ARENA_MAX) {
    x = PLAYER_ARENA_MAX - 0.8
    fix = true
  }
  if (z < PLAYER_ARENA_MIN) {
    z = PLAYER_ARENA_MIN + 0.8
    fix = true
  } else if (z > PLAYER_ARENA_MAX) {
    z = PLAYER_ARENA_MAX - 0.8
    fix = true
  }
  if (y > PLAYER_MAX_Y || y < -0.5) {
    y = 1.2
    fix = true
  }

  if (!fix) return
  containCooldown = 0.4
  void movePlayerTo({
    newRelativePosition: Vector3.create(x, Math.max(0.4, y), z)
  }).catch(() => undefined)
}

/** Camping on the center play sphere with no movement drains aura */
const CAMP_RADIUS = 5.5
const CAMP_MOVE_EPS = 0.4 // m/s — below this counts as standing still
const CAMP_DRAIN = 100
let campAccum = 0
let lastCampX = 24
let lastCampZ = 24
let lastHudAura = -1
const SCORE_POP_DUR = 0.14

function finishRun() {
  const peak = gameState.peakAura
  endRound()
  stopSigmaTrail()
  clearBrainrots()
  stopGameMusic()
  playPriceIsWrongSfx()
  submitRunScore(peak)
  updateScoreboard()
  setStartControlsVisible(true)
  void triggerEmote({
    predefinedEmote: peak >= 5000 ? 'clap' : 'wave'
  }).catch(() => undefined)
}

export function startGame() {
  if (gameState.phase === 'playing') return
  clearBrainrots()
  stopSigmaTrail()
  resetRound()
  resetMultiplyRamp()
  chaosTimer = 4
  bossTaxCooldown = 0
  campAccum = 0
  gameState.hudBeat = 0
  gameState.scorePop = 0
  gameState.showHowTo = false
  lastHudAura = STARTING_AURA
  setStartControlsVisible(false)
  if (Transform.has(engine.PlayerEntity)) {
    const p = Transform.get(engine.PlayerEntity).position
    lastCampX = p.x
    lastCampZ = p.z
  }
  relocateOhioZone()
  startGameMusic()
  updateScoreboard()
  void triggerEmote({ predefinedEmote: 'robot' }).catch(() => undefined)

  for (let i = 0; i < 4; i++) spawnBrainrot()
  spawnBrainrot('fanum')
}

function tickCampingPenalty(dt: number) {
  if (!Transform.has(engine.PlayerEntity)) return
  const p = Transform.get(engine.PlayerEntity).position
  const dx = p.x - ARENA_CENTER.x
  const dz = p.z - ARENA_CENTER.z
  const nearPad = dx * dx + dz * dz <= CAMP_RADIUS * CAMP_RADIUS

  const speed =
    dt > 0.0001
      ? Math.sqrt((p.x - lastCampX) * (p.x - lastCampX) + (p.z - lastCampZ) * (p.z - lastCampZ)) / dt
      : 0
  lastCampX = p.x
  lastCampZ = p.z

  if (!nearPad || speed > CAMP_MOVE_EPS) {
    campAccum = 0
    return
  }

  campAccum += dt
  while (campAccum >= 1 && gameState.aura > 0) {
    campAccum -= 1
    const lost = Math.min(CAMP_DRAIN, gameState.aura)
    gameState.aura = Math.max(0, gameState.aura - CAMP_DRAIN)
    gameState.combo = 0
    gameState.comboTimer = 0
    gameState.chaos = { text: 'NO CAMPING!', ttl: 1.0 }
    gameState.announcementFlash = 0.25
    spawnScorePopup(Vector3.create(p.x, p.y, p.z), -lost, false)
    playScoreSfx()
  }
}

export function fireGyattButton() {
  if (gameState.phase !== 'playing') return
  if (gameState.gyattCooldown > 0) return

  gameState.gyattCooldown = GYATT_COOLDOWN
  const gained = addAura(GYATT_POWER)
  gameState.hits += 1
  gameState.combo += 3
  gameState.comboTimer = COMBO_WINDOW
  gameState.chaos = { text: 'BONUS ORB!', ttl: 1.6 }
  gameState.announcementFlash = 0.4
  playBonusSfx()

  if (Transform.has(engine.PlayerEntity)) {
    const p = Transform.get(engine.PlayerEntity).position
    spawnScorePopup(Vector3.create(p.x, p.y, p.z), gained, true)
  }

  // Spawn a few freebies after the scream
  spawnBrainrot('gyatt')
  spawnBrainrot('rizz')
  spawnBrainrot('sigma')
  void triggerEmote({ predefinedEmote: 'clap' }).catch(() => undefined)
}

export function returnToMenu() {
  clearBrainrots()
  stopGameMusic()
  gameState.phase = 'menu'
  gameState.chaos = null
  gameState.showHowTo = false
  setStartControlsVisible(true)
  updateScoreboard()
}

function updateScoreboard() {
  const board = getScoreboard()
  if (!board || !TextShape.has(board)) return
  const text = TextShape.getMutable(board)

  // World scoreboard only appears with end-of-run results
  if (gameState.phase === 'gameover' && gameState.lastRank) {
    text.text = `${gameState.lastRank.title}\nPeak ${gameState.peakAura}`
  } else {
    text.text = ''
  }
}

function playerInOhioZone(): boolean {
  if (!Transform.has(engine.PlayerEntity)) return false
  const p = Transform.get(engine.PlayerEntity).position
  const dx = p.x - OHIO_ZONE_CENTER.x
  const dz = p.z - OHIO_ZONE_CENTER.z
  return Math.sqrt(dx * dx + dz * dz) <= OHIO_ZONE_RADIUS
}

function distanceToBoss(): number {
  const boss = getBossEntity()
  if (!boss || !Transform.has(boss) || !Transform.has(engine.PlayerEntity)) return 999
  const b = Transform.get(boss).position
  const p = Transform.get(engine.PlayerEntity).position
  const dx = p.x - b.x
  const dz = p.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

function updateBoss(dt: number) {
  const boss = getBossEntity()
  if (!boss || !Transform.has(boss)) return

  bossAngle += dt * 0.55
  const radius = 14
  const t = Transform.getMutable(boss)
  t.position = Vector3.create(24 + Math.cos(bossAngle) * radius, 0, 24 + Math.sin(bossAngle) * radius)
  // Facing + chomp handled in animateBoss (always looks at player)
  animateBoss(dt)

  if (gameState.phase !== 'playing') return

  bossTaxCooldown -= dt
  if (bossTaxCooldown <= 0 && distanceToBoss() < 7.2) {
    bossTaxCooldown = 2.8
    // Sigma boost: Skibidi drain does nothing while invincible
    if (isSigmaInvincible()) return

    // Flat 50% of current aura — ignore multipliers so the hit is exact
    const lost = Math.floor(gameState.aura * 0.5)
    gameState.aura = Math.max(0, gameState.aura - lost)
    gameState.taxes += 1
    gameState.combo = 0
    gameState.comboTimer = 0
    gameState.chaos = {
      text: 'SKIBIDI DRAIN!',
      ttl: 1.6
    }
    gameState.announcementFlash = 0.4
    if (lost > 0) {
      spawnScorePopup(t.position, -lost, false)
      playAmogusSfx()
    }
  }
}

function maybeChaosEvent() {
  const line = CHAOS_LINES[Math.floor(Math.random() * CHAOS_LINES.length)]
  gameState.chaos = { text: line, ttl: 2.4 }
  gameState.announcementFlash = 0.35

  if (line.includes('Sigma')) {
    gameState.multiplier = Math.max(gameState.multiplier, 2)
    gameState.multiplierTimer = Math.max(gameState.multiplierTimer, 6)
    spawnBrainrot('sigma')
    startSigmaTrail(6)
  } else if (line.includes('Tax')) {
    spawnBrainrot('fanum')
    if (!isMobile()) spawnBrainrot('fanum')
  } else if (line.includes('Skibidi')) {
    const n = isMobile() ? 2 : 4
    for (let i = 0; i < n; i++) spawnBrainrot('skibidi')
  } else if (line.includes('JACKPOT') || line.includes('Jackpot')) {
    spawnBrainrot('gyatt')
    if (!isMobile()) spawnBrainrot('gyatt')
  } else if (line.includes('RIZZ') || line.includes('Ohio')) {
    gameState.multiplier = Math.max(gameState.multiplier, 1.5)
    gameState.multiplierTimer = Math.max(gameState.multiplierTimer, 4)
  }
}

export function gameSystem(dt: number) {
  floorTileSystem(dt)
  updateBoss(dt)
  brainrotSystem(dt)
  tickOhioZoneRelocation(dt)
  tickWallLights(dt)
  tickLeaderboard(dt)
  tickGameMusic(dt)
  tickBonusPad(dt, gameState.gyattCooldown, gameState.phase === 'playing')
  tickSigmaTrail(dt)
  containPlayerInArena(dt)

  // Timers shared across phases for UI fade
  if (gameState.chaos) {
    gameState.chaos.ttl -= dt
    if (gameState.chaos.ttl <= 0) gameState.chaos = null
  }
  if (gameState.announcementFlash > 0) gameState.announcementFlash -= dt
  if (gameState.scorePop > 0) {
    gameState.scorePop = Math.max(0, gameState.scorePop - dt)
  }
  if (gameState.phase === 'playing' || gameState.phase === 'gameover') {
    gameState.hudBeat += dt
    if (gameState.phase === 'playing') {
      if (lastHudAura >= 0 && gameState.aura !== lastHudAura) {
        gameState.scorePop = SCORE_POP_DUR
      }
      lastHudAura = gameState.aura
    }
  }

  if (gameState.phase !== 'playing') {
    pulseOhioZone(false)
    return
  }

  if (gameState.gyattCooldown > 0) gameState.gyattCooldown -= dt

  if (gameState.comboTimer > 0) {
    gameState.comboTimer -= dt
    if (gameState.comboTimer <= 0) gameState.combo = 0
  }

  if (gameState.multiplierTimer > 0) {
    gameState.multiplierTimer -= dt
    if (gameState.multiplierTimer <= 0) gameState.multiplier = 1
  }

  const inOhio = playerInOhioZone()
  gameState.ohioZoneActive = inOhio
  pulseOhioZone(inOhio)

  tickCampingPenalty(dt)

  chaosTimer -= dt
  if (chaosTimer <= 0) {
    maybeChaosEvent()
    chaosTimer = 6 + Math.random() * 4
  }

  updateScoreboard()

  if (isBankrupt()) {
    finishRun()
  }
}
