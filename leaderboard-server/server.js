/**
 * Permanent top-20 aura leaderboard for OHIO AURA WARS.
 * Persist one JSON file; only keep each wallet's best peak score.
 *
 * Env:
 *   PORT=3009   # next free port after 3000-3008 on Hetzner
 *   DATA_DIR=./data
 *   ALLOW_TEST_MODE=1   # allow POST without signedFetch headers (local only)
 */

const fs = require('fs')
const path = require('path')
const express = require('express')
const cors = require('cors')

const PORT = Number(process.env.PORT || 3009)
const TOP_N = 20
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
const STATE_FILE = path.join(DATA_DIR, 'aura-leaderboard.json')
const STATE_TMP = path.join(DATA_DIR, 'aura-leaderboard.json.tmp')
const ALLOW_TEST_MODE = process.env.ALLOW_TEST_MODE === '1' || process.env.ALLOW_TEST_MODE === 'true'

const app = express()
app.use(cors({ origin: true }))
app.use(express.json({ limit: '32kb' }))

/** @type {{ sequence: number, updatedAtMs: number, scores: Record<string, { displayName: string, score: number, updatedAtMs: number }> }} */
let state = {
  sequence: 0,
  updatedAtMs: Date.now(),
  scores: {}
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function loadState() {
  ensureDataDir()
  if (!fs.existsSync(STATE_FILE)) return
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    state = {
      sequence: Number(raw.sequence) || 0,
      updatedAtMs: Number(raw.updatedAtMs) || Date.now(),
      scores: raw.scores && typeof raw.scores === 'object' ? raw.scores : {}
    }
  } catch (err) {
    console.warn('Failed to load leaderboard state', err)
  }
}

function saveState() {
  ensureDataDir()
  fs.writeFileSync(STATE_TMP, JSON.stringify(state, null, 2))
  fs.renameSync(STATE_TMP, STATE_FILE)
}

function buildTop() {
  const rows = Object.entries(state.scores).map(([walletKey, row]) => ({
    walletKey,
    displayName: (row.displayName || 'Player').slice(0, 24),
    score: Math.max(0, Math.floor(Number(row.score) || 0))
  }))
  rows.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName))
  return rows.slice(0, TOP_N).map((row, i) => ({
    rank: i + 1,
    walletKey: row.walletKey,
    displayName: row.displayName,
    score: row.score
  }))
}

function payload() {
  return {
    sequence: state.sequence,
    updatedAtMs: state.updatedAtMs,
    top: buildTop()
  }
}

function walletFromAuthChain(req) {
  const header =
    req.headers['x-identity-auth-chain-0'] ||
    req.headers['x-identity-auth-chain'] ||
    req.headers['x-identity-auth-chain-proof']
  if (!header) return null
  try {
    const parsed = typeof header === 'string' ? JSON.parse(header) : header
    const payloadAddr = (parsed.payload || parsed.address || '').toString().trim().toLowerCase()
    return payloadAddr || null
  } catch {
    return null
  }
}

function requireDclAuth(req, res, next) {
  const wallet = walletFromAuthChain(req)
  const timestamp = req.headers['x-identity-timestamp']
  if (wallet && timestamp) {
    req.walletKey = wallet
    return next()
  }
  if (ALLOW_TEST_MODE) {
    const bodyWallet = (req.body?.walletKey || '').toString().trim().toLowerCase()
    req.walletKey = bodyWallet || 'test-wallet'
    console.warn('TEST MODE: accepting score without signedFetch')
    return next()
  }
  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Use signedFetch from the Decentraland scene.'
  })
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, top: buildTop().length })
})

app.get('/api/aura/leaderboard', (_req, res) => {
  res.json(payload())
})

app.post('/api/aura/score', requireDclAuth, (req, res) => {
  const walletKey = req.walletKey
  const score = Math.floor(Number(req.body?.score) || 0)
  const displayName = (req.body?.displayName || 'Player').toString().slice(0, 24)

  if (!walletKey || score <= 0) {
    return res.status(400).json({ error: 'Invalid score' })
  }

  const prev = state.scores[walletKey]
  if (!prev || score > prev.score) {
    state.scores[walletKey] = {
      displayName,
      score,
      updatedAtMs: Date.now()
    }
    state.sequence += 1
    state.updatedAtMs = Date.now()
    saveState()
  } else if (prev && displayName && displayName !== prev.displayName) {
    prev.displayName = displayName
    saveState()
  }

  res.json(payload())
})

loadState()
app.listen(PORT, () => {
  console.log(`Aura Wars leaderboard listening on :${PORT}`)
  console.log(`GET  /api/aura/leaderboard`)
  console.log(`POST /api/aura/score (signedFetch)`)
})
