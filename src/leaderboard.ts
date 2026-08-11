import { MessageBus } from '@dcl/sdk/message-bus'
import { getPlayer } from '@dcl/sdk/players'
import { signedFetch } from '~system/SignedFetch'
import { LEADERBOARD_API_BASE, LEADERBOARD_TOP_N } from './config'
import {
  applyLeaderboardPayload,
  getCachedLeaderboard,
  LeaderEntry,
  LeaderboardPayload,
  spawnLeaderboardBoard
} from './leaderboardBoard'

const bus = new MessageBus()
const BUS_EVENT = 'aura-wars:leaderboard'

let refreshTimer = 0
let submitting = false

function normalizeWallet(wallet: string | null | undefined): string {
  return (wallet || '').trim().toLowerCase()
}

function localIdentity(): { walletKey: string; displayName: string } {
  const player = getPlayer()
  const walletKey = normalizeWallet(player?.userId)
  const displayName = (player?.name || 'Player').slice(0, 24)
  return { walletKey: walletKey || 'unknown', displayName }
}

function rankTop(entries: LeaderEntry[]): LeaderEntry[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName))
  return sorted.slice(0, LEADERBOARD_TOP_N).map((row, i) => ({
    ...row,
    rank: i + 1
  }))
}

/** Merge a score into the cached board (live MessageBus + optimistic local). */
function mergeScoreIntoBoard(walletKey: string, displayName: string, score: number) {
  const key = normalizeWallet(walletKey)
  if (!key || score <= 0) return

  const cached = getCachedLeaderboard()
  const map = new Map<string, LeaderEntry>()
  for (const row of cached?.top || []) {
    map.set(normalizeWallet(row.walletKey), {
      rank: 0,
      walletKey: normalizeWallet(row.walletKey),
      displayName: row.displayName,
      score: row.score
    })
  }

  const prev = map.get(key)
  if (!prev || score > prev.score) {
    map.set(key, {
      rank: 0,
      walletKey: key,
      displayName: displayName || prev?.displayName || 'Player',
      score
    })
  }

  const payload: LeaderboardPayload = {
    sequence: (cached?.sequence || 0) + 1,
    updatedAtMs: Date.now(),
    top: rankTop(Array.from(map.values()))
  }
  applyLeaderboardPayload(payload)
  bus.emit(BUS_EVENT, payload)
}

async function fetchBoardFromServer() {
  if (!LEADERBOARD_API_BASE) return
  try {
    const res = await fetch(`${LEADERBOARD_API_BASE}/api/aura/leaderboard`)
    if (!res.ok) return
    const data = (await res.json()) as LeaderboardPayload
    if (data && Array.isArray(data.top)) {
      applyLeaderboardPayload({
        sequence: Number(data.sequence) || 0,
        updatedAtMs: Number(data.updatedAtMs) || Date.now(),
        top: data.top
      })
    }
  } catch (err) {
    console.log('Leaderboard fetch failed', err)
  }
}

async function submitScoreToServer(score: number) {
  if (!LEADERBOARD_API_BASE || score <= 0 || submitting) return
  submitting = true
  const { walletKey, displayName } = localIdentity()

  try {
    const response = await signedFetch({
      url: `${LEADERBOARD_API_BASE}/api/aura/score`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, score })
      }
    })

    if (response.status >= 200 && response.status < 300 && response.body) {
      try {
        const data = JSON.parse(response.body) as LeaderboardPayload
        if (data && Array.isArray(data.top)) {
          applyLeaderboardPayload(data)
          bus.emit(BUS_EVENT, data)
          return
        }
      } catch {
        // fall through to merge
      }
    }
  } catch (err) {
    console.log('Leaderboard submit failed', err)
  } finally {
    submitting = false
  }

  // Offline / API down — still update everyone in the scene
  mergeScoreIntoBoard(walletKey, displayName, score)
}

export function setupLeaderboard() {
  spawnLeaderboardBoard()
  applyLeaderboardPayload({
    sequence: 0,
    updatedAtMs: Date.now(),
    top: []
  })

  bus.on(BUS_EVENT, (payload: LeaderboardPayload) => {
    if (!payload || !Array.isArray(payload.top)) return
    const cached = getCachedLeaderboard()
    if (cached && Number(payload.sequence) < Number(cached.sequence)) return
    applyLeaderboardPayload(payload)
  })

  void fetchBoardFromServer()
}

/** Call when a run ends with the peak aura for that run. */
export function submitRunScore(peakAura: number) {
  const score = Math.max(0, Math.floor(peakAura))
  if (score <= 0) return
  const { walletKey, displayName } = localIdentity()
  mergeScoreIntoBoard(walletKey, displayName, score)
  void submitScoreToServer(score)
}

/** Periodic refresh from the permanent store. */
export function tickLeaderboard(dt: number) {
  refreshTimer -= dt
  if (refreshTimer > 0) return
  refreshTimer = 45
  void fetchBoardFromServer()
}
