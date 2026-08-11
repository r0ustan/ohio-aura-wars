import { AudioSource, engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { gameState } from './gameState'

/**
 * Local-only playlist (not syncEntity / not networked).
 * Each client runs their own shuffle bag — other players never hear your music.
 *
 * IMPORTANT: `global: true` AudioSource only works on DCL desktop 2.0.
 * Mobile ignores global clips, so music is positional and attached to the
 * local player (same approach as SFX) for consistent volume everywhere.
 *
 * DCL often leaves AudioSource.playing stuck true after a clip ends, so we
 * advance the playlist with known track durations instead.
 */
const TRACKS: Array<{ url: string; duration: number }> = [
  { url: 'music/gummybear.mp3', duration: 146.95 },
  { url: 'music/italian-brainrot.mp3', duration: 70.69 },
  { url: 'music/skibiditoilet.mp3', duration: 80.88 },
  { url: 'music/ElChombo.mp3', duration: 142.92 },
  { url: 'music/PPAP.mp3', duration: 121.36 }
]

let musicEntity: Entity | null = null
let shuffleBag: Array<{ url: string; duration: number }> = []
let active = false
let timeLeft = 0
let currentUrl = ''

function refillBag() {
  shuffleBag = [...TRACKS]
  for (let i = shuffleBag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = shuffleBag[i]
    shuffleBag[i] = shuffleBag[j]
    shuffleBag[j] = tmp
  }
}

function nextTrack() {
  if (shuffleBag.length === 0) refillBag()
  return shuffleBag.pop() as { url: string; duration: number }
}

function ensureEntity() {
  if (musicEntity && Transform.has(musicEntity)) {
    // Keep attached to local player when available (mobile-safe positional audio)
    const t = Transform.getMutable(musicEntity)
    if (Transform.has(engine.PlayerEntity) && t.parent !== engine.PlayerEntity) {
      t.parent = engine.PlayerEntity
      t.position = Vector3.create(0, 1.4, 0)
    }
    return musicEntity
  }

  musicEntity = engine.addEntity()
  if (Transform.has(engine.PlayerEntity)) {
    Transform.create(musicEntity, {
      parent: engine.PlayerEntity,
      position: Vector3.create(0, 1.4, 0)
    })
  } else {
    Transform.create(musicEntity, { position: Vector3.create(24, 1.5, 24) })
  }
  return musicEntity
}

function playClip(track: { url: string; duration: number }) {
  const entity = ensureEntity()
  currentUrl = track.url
  // Small pad so we don't cut the last beat; still advances reliably
  timeLeft = Math.max(5, track.duration + 0.35)

  AudioSource.createOrReplace(entity, {
    audioClipUrl: track.url,
    playing: true,
    loop: false,
    volume: 0.55,
    // Must stay false — global audio is desktop-only and silent on mobile
    global: false,
    currentTime: 0
  })
}

function playNext() {
  playClip(nextTrack())
}

export function startGameMusic() {
  active = true
  refillBag()
  playNext()
}

export function stopGameMusic() {
  active = false
  timeLeft = 0
  currentUrl = ''
  if (musicEntity && AudioSource.has(musicEntity)) {
    AudioSource.getMutable(musicEntity).playing = false
  }
}

/** Advance playlist while a round is active. */
export function tickGameMusic(dt: number) {
  if (!active) return
  if (gameState.phase !== 'playing') {
    stopGameMusic()
    return
  }

  // Re-attach if player entity appeared after first play
  ensureEntity()

  if (!musicEntity || !AudioSource.has(musicEntity) || !currentUrl) {
    playNext()
    return
  }

  timeLeft -= dt
  if (timeLeft <= 0) {
    playNext()
  }
}
