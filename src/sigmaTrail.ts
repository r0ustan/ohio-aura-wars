import {
  engine,
  Entity,
  ParticleSystem,
  Transform
} from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'
import { Color4, Vector3 } from '@dcl/sdk/math'

let trailRoot: Entity | null = null
let trailBody: Entity | null = null
let trailSparks: Entity | null = null
let trailTtl = 0
let active = false

function ensureTrail() {
  if (trailRoot && Transform.has(trailRoot)) return

  trailRoot = engine.addEntity()
  Transform.create(trailRoot, {
    position: Vector3.create(0, 1.05, 0),
    parent: engine.PlayerEntity
  })

  trailBody = engine.addEntity()
  Transform.create(trailBody, {
    position: Vector3.create(0, 0, 0),
    parent: trailRoot
  })
  ParticleSystem.create(trailBody, {
    active: false,
    loop: true,
    rate: isMobile() ? 28 : 55,
    maxParticles: isMobile() ? 70 : 140,
    lifetime: 0.7,
    gravity: 0.15,
    billboard: true,
    blendMode: 1,
    simulationSpace: 1, // PSS_WORLD — leave particles behind as you move
    shape: ParticleSystem.Shape.Sphere({ radius: 0.18 }),
    initialSize: { start: 0.14, end: 0.32 },
    sizeOverTime: { start: 1, end: 0.05 },
    initialVelocitySpeed: { start: 0.15, end: 0.7 },
    initialColor: {
      start: Color4.create(1, 0.95, 0.45, 1),
      end: Color4.create(0.85, 0.95, 1, 0.9)
    },
    colorOverTime: {
      start: Color4.create(1, 0.9, 0.35, 0.95),
      end: Color4.create(0.55, 0.85, 1, 0)
    }
  })

  trailSparks = engine.addEntity()
  Transform.create(trailSparks, {
    position: Vector3.create(0, 0.15, 0),
    parent: trailRoot
  })
  ParticleSystem.create(trailSparks, {
    active: false,
    loop: true,
    rate: isMobile() ? 14 : 28,
    maxParticles: isMobile() ? 40 : 80,
    lifetime: 0.45,
    gravity: -0.4,
    billboard: true,
    blendMode: 1,
    simulationSpace: 1,
    shape: ParticleSystem.Shape.Cone({ angle: 28, radius: 0.12 }),
    initialSize: { start: 0.06, end: 0.16 },
    sizeOverTime: { start: 1.1, end: 0.02 },
    initialVelocitySpeed: { start: 0.4, end: 1.6 },
    initialColor: {
      start: Color4.create(1, 1, 1, 1),
      end: Color4.create(0.6, 0.95, 1, 1)
    },
    colorOverTime: {
      start: Color4.create(1, 0.98, 0.7, 1),
      end: Color4.create(0.4, 0.75, 1, 0)
    }
  })
}

function setTrailActive(on: boolean) {
  ensureTrail()
  if (trailBody && ParticleSystem.has(trailBody)) {
    ParticleSystem.getMutable(trailBody).active = on
  }
  if (trailSparks && ParticleSystem.has(trailSparks)) {
    ParticleSystem.getMutable(trailSparks).active = on
  }
  active = on
}

/** Gold/cyan light trails from the avatar for the duration of a Sigma boost. */
export function startSigmaTrail(seconds: number) {
  ensureTrail()
  trailTtl = Math.max(trailTtl, seconds)
  setTrailActive(true)
}

/** True while Sigma boost is active — Fanums explode on touch; Skibidi toilet still taxes. */
export function isSigmaInvincible(): boolean {
  return trailTtl > 0
}

export function stopSigmaTrail() {
  trailTtl = 0
  if (active) setTrailActive(false)
}

export function tickSigmaTrail(dt: number) {
  if (trailTtl <= 0) {
    if (active) setTrailActive(false)
    return
  }
  trailTtl -= dt
  if (trailTtl <= 0) {
    trailTtl = 0
    setTrailActive(false)
  }
}
