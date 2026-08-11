export type GamePhase = 'menu' | 'playing' | 'gameover'

export type ChaosEvent = {
  text: string
  ttl: number
}

export type Rank = {
  title: string
  subtitle: string
}

export const STARTING_AURA = 1000

export const gameState = {
  phase: 'menu' as GamePhase,
  aura: 0,
  /** Highest aura reached during the current run */
  peakAura: 0,
  /** Best peak across runs this session — never reset on death */
  bestAura: 0,
  combo: 0,
  comboTimer: 0,
  multiplier: 1,
  multiplierTimer: 0,
  gyattCooldown: 0,
  hits: 0,
  taxes: 0,
  chaos: null as ChaosEvent | null,
  lastRank: null as Rank | null,
  ohioZoneActive: false,
  announcementFlash: 0,
  /** Seconds — drives HUD score heartbeat pulse */
  hudBeat: 0,
  /** Seconds remaining for the 3× score-change pop */
  scorePop: 0,
  /** How-to panel open (menu / gameover only) */
  showHowTo: false
}

export const GYATT_COOLDOWN = 8
export const GYATT_POWER = 777
export const COMBO_WINDOW = 1.6

export function getRank(aura: number): Rank {
  if (aura >= 9000) {
    return {
      title: 'MAXIMUM BRAINROT',
      subtitle: 'Reality uninstalled. Congrats, freak.'
    }
  }
  if (aura >= 7000) {
    return {
      title: 'OHIO FINAL BOSS',
      subtitle: 'The cornfields fear you.'
    }
  }
  if (aura >= 5000) {
    return {
      title: 'CERTIFIED SIGMA',
      subtitle: 'You grindset so hard you skipped childhood.'
    }
  }
  if (aura >= 3000) {
    return {
      title: 'RIZZLER CLASS A',
      subtitle: 'Mid? Never heard of her.'
    }
  }
  if (aura >= 1500) {
    return {
      title: 'NPC WITH WIFI',
      subtitle: 'You exist. Barely.'
    }
  }
  if (aura >= 500) {
    return {
      title: 'PROFESSIONAL UNC',
      subtitle: 'Please leave the group chat.'
    }
  }
  return {
    title: 'TOUCH GRASS VICTIM',
    subtitle: 'Fanum ate your aura for breakfast.'
  }
}

export const CHAOS_LINES = [
  'Tax collectors incoming!',
  'Skibidi rush!',
  'Jackpot spawn!',
  'Sigma boost!',
  'Ohio energy rising!',
  'Watch the red ones!'
]

export function resetRound() {
  gameState.phase = 'playing'
  gameState.aura = STARTING_AURA
  gameState.peakAura = STARTING_AURA
  gameState.combo = 0
  gameState.comboTimer = 0
  gameState.multiplier = 1
  gameState.multiplierTimer = 0
  gameState.gyattCooldown = 0
  gameState.hits = 0
  gameState.taxes = 0
  gameState.chaos = null
  gameState.lastRank = null
  gameState.ohioZoneActive = false
  gameState.announcementFlash = 0
  gameState.scorePop = 0
}

export function endRound() {
  gameState.phase = 'gameover'
  // Rank + high score use the peak you touched, not the final 0
  gameState.lastRank = getRank(gameState.peakAura)
  if (gameState.peakAura > gameState.bestAura) {
    gameState.bestAura = gameState.peakAura
  }
  gameState.chaos = null
  gameState.combo = 0
  gameState.multiplier = 1
  gameState.ohioZoneActive = false
}

export function addAura(base: number) {
  const ohioBonus = gameState.ohioZoneActive ? 2 : 1
  const comboBonus = 1 + Math.min(gameState.combo, 12) * 0.08
  const gained = Math.floor(base * gameState.multiplier * ohioBonus * comboBonus)
  gameState.aura = Math.max(0, gameState.aura + gained)
  if (gameState.aura > gameState.peakAura) {
    gameState.peakAura = gameState.aura
  }
  return gained
}

export function isBankrupt() {
  return gameState.phase === 'playing' && gameState.aura <= 0
}
