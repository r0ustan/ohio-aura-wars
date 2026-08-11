import { AudioSource, engine, Entity, Schemas, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

/**
 * One-shot SFX — each play gets its own local (non-synced) entity so clips can overlap.
 * Attached to the local player; not networked, so only that player hears them.
 */

const SfxLife = engine.defineComponent('local-sfx-life', {
  ttl: Schemas.Number
})

/** Random pool for gaining / losing points (excludes special-case clips). */
const SCORE_SOUNDS = [
  'sounds/big-shaq-boom.mp3',
  'sounds/FAAAAH.mp3',
  'sounds/angels.mp3',
  'sounds/chipmunk.mp3',
  'sounds/emotionaldamage.mp3',
  'sounds/fart.mp3',
  'sounds/fartshart.mp3',
  'sounds/punch.mp3',
  'sounds/quack.mp3',
  'sounds/shock.mp3',
  'sounds/squeakytoy.mp3',
  'sounds/trumpet.mp3',
  'sounds/trumpetog.mp3',
  'sounds/whistlethingy.mp3',
  'sounds/wow.mp3'
]

const AMOGUS = 'sounds/amogus.mp3'
const PRICE_IS_WRONG = 'sounds/priceiswrong.mp3'
const THUD = 'sounds/thud.mp3'
const TACO_BELL_BONG = 'sounds/taco-bell-bong.mp3'
const HEARTBEAT = 'sounds/heartbeat.mp3'
/** DCL clamps a single AudioSource ~0–1; stack copies for louder pulse. */
const HEARTBEAT_LAYERS = 5

let heartbeatEntities: Entity[] = []
let heartbeatActive = false

function attachHeartbeatTransform(entity: Entity, layer: number) {
  // Tiny offsets so layers don't perfectly cancel in the mixer
  const y = 1.5 + layer * 0.08
  if (Transform.has(engine.PlayerEntity)) {
    if (Transform.has(entity)) {
      const t = Transform.getMutable(entity)
      t.parent = engine.PlayerEntity
      t.position = Vector3.create(0.05 * layer, y, 0)
    } else {
      Transform.create(entity, {
        parent: engine.PlayerEntity,
        position: Vector3.create(0.05 * layer, y, 0)
      })
    }
  } else if (!Transform.has(entity)) {
    Transform.create(entity, { position: Vector3.create(24, y, 24) })
  }
}

function ensureHeartbeatLayers() {
  while (heartbeatEntities.length < HEARTBEAT_LAYERS) {
    heartbeatEntities.push(engine.addEntity())
  }
  for (let i = 0; i < HEARTBEAT_LAYERS; i++) {
    const e = heartbeatEntities[i]
    if (!Transform.has(e)) {
      attachHeartbeatTransform(e, i)
    } else if (Transform.has(engine.PlayerEntity)) {
      const t = Transform.getMutable(e)
      if (t.parent !== engine.PlayerEntity) attachHeartbeatTransform(e, i)
    }
  }
  return heartbeatEntities
}

function startHeartbeat() {
  if (heartbeatActive) return
  heartbeatActive = true
  const layers = ensureHeartbeatLayers()
  for (let i = 0; i < layers.length; i++) {
    AudioSource.createOrReplace(layers[i], {
      audioClipUrl: HEARTBEAT,
      playing: true,
      loop: true,
      volume: 1,
      global: false,
      currentTime: 0
    })
  }
}

function stopHeartbeat() {
  heartbeatActive = false
  for (const e of heartbeatEntities) {
    if (AudioSource.has(e)) {
      AudioSource.getMutable(e).playing = false
    }
  }
}

/** Loop heartbeat.mp3 only while the low-aura red screen is showing. */
export function tickLowAuraHeartbeat(danger: boolean) {
  if (danger) {
    // Keep layers parented if the player entity appears mid-danger
    if (heartbeatActive) ensureHeartbeatLayers()
    startHeartbeat()
  } else {
    stopHeartbeat()
  }
}

function playLocalClip(url: string, volume = 0.9, ttl = 4) {
  const entity = engine.addEntity()

  if (Transform.has(engine.PlayerEntity)) {
    Transform.create(entity, {
      parent: engine.PlayerEntity,
      position: Vector3.create(0, 1.4, 0)
    })
  } else {
    Transform.create(entity, { position: Vector3.create(24, 1.5, 24) })
  }

  AudioSource.create(entity, {
    audioClipUrl: url,
    playing: true,
    loop: false,
    volume,
    global: false
  })
  SfxLife.create(entity, { ttl })
}

function pickScoreSound() {
  return SCORE_SOUNDS[Math.floor(Math.random() * SCORE_SOUNDS.length)]
}

/** Random meme SFX when aura goes up or down (not boss / not round end / not lightning). */
export function playScoreSfx() {
  playLocalClip(pickScoreSound())
}

/** Giant Skibidi toilet contact only. */
export function playAmogusSfx() {
  playLocalClip(AMOGUS, 1)
}

/** Round over / game over only. */
export function playPriceIsWrongSfx() {
  playLocalClip(PRICE_IS_WRONG, 1, 6)
}

/** Lightning / Fanum warning only. */
export function playThudSfx() {
  playLocalClip(THUD, 1, 2)
}

/** Bonus orb (+777) pickup only. */
export function playBonusSfx() {
  playLocalClip(TACO_BELL_BONG, 1, 4)
}

export function sfxSystem(dt: number) {
  for (const [entity] of engine.getEntitiesWith(SfxLife)) {
    const life = SfxLife.getMutable(entity)
    life.ttl -= dt
    if (life.ttl <= 0) {
      engine.removeEntity(entity)
    }
  }
}
