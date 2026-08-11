import { engine, ParticleSystem, Schemas, Transform } from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { BrainrotKind } from './characters'

const MistFx = engine.defineComponent('mist-burst-fx', {
  ttl: Schemas.Number
})

type MistPalette = {
  start: Color4
  mid: Color4
}

const PALETTES: Record<BrainrotKind, MistPalette> = {
  rizz: {
    start: Color4.create(1, 0.55, 0.9, 0.95),
    mid: Color4.create(0.85, 0.4, 1, 0.55)
  },
  skibidi: {
    start: Color4.create(0.55, 0.85, 1, 0.95),
    mid: Color4.create(0.7, 0.95, 1, 0.5)
  },
  gyatt: {
    start: Color4.create(1, 0.85, 0.35, 0.95),
    mid: Color4.create(1, 0.55, 0.85, 0.55)
  },
  fanum: {
    start: Color4.create(0.35, 1, 0.3, 0.9),
    mid: Color4.create(0.9, 0.15, 0.2, 0.5)
  },
  sigma: {
    start: Color4.create(1, 0.92, 0.35, 0.95),
    mid: Color4.create(0.95, 0.95, 1, 0.55)
  }
}

/** Soft magical mist poof when a character is collected. Skipped on mobile. */
export function spawnMistBurst(worldPos: Vector3, kind: BrainrotKind, good: boolean) {
  if (isMobile()) return

  const palette = PALETTES[kind]
  const emitter = engine.addEntity()

  Transform.create(emitter, {
    position: Vector3.create(worldPos.x, worldPos.y + 1.1, worldPos.z)
  })

  MistFx.create(emitter, { ttl: 2.4 })

  ParticleSystem.create(emitter, {
    active: true,
    loop: false,
    rate: 0,
    maxParticles: 120,
    lifetime: 1.35,
    gravity: -0.35, // gentle float upward
    billboard: true,
    blendMode: 1, // PSB_ADD — soft magical glow
    shape: ParticleSystem.Shape.Sphere({ radius: 0.55 }),
    initialSize: { start: 0.18, end: 0.45 },
    sizeOverTime: { start: 0.55, end: 1.4 },
    initialVelocitySpeed: { start: 0.6, end: good ? 2.4 : 1.6 },
    initialColor: {
      start: palette.start,
      end: palette.mid
    },
    colorOverTime: {
      start: palette.mid,
      end: Color4.create(palette.mid.r, palette.mid.g, palette.mid.b, 0)
    },
    bursts: {
      values: [
        {
          time: 0,
          count: good ? 70 : 45,
          cycles: 1,
          interval: 0.05,
          probability: 1
        },
        {
          time: 0.12,
          count: good ? 35 : 20,
          cycles: 1,
          interval: 0.05,
          probability: 1
        }
      ]
    }
  })
}

export function mistBurstSystem(dt: number) {
  for (const [entity] of engine.getEntitiesWith(MistFx, Transform)) {
    const fx = MistFx.getMutable(entity)
    fx.ttl -= dt
    if (fx.ttl <= 0) {
      engine.removeEntity(entity)
    }
  }
}
