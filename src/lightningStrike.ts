import { engine, Material, MeshRenderer, ParticleSystem, Schemas, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { playThudSfx } from './sfxPlayer'

const LightningFx = engine.defineComponent('lightning-strike-fx', {
  ttl: Schemas.Number
})

const PendingFlash = engine.defineComponent('lightning-pending-flash', {
  ttl: Schemas.Number,
  x: Schemas.Number,
  z: Schemas.Number,
  generation: Schemas.Number
})

function addTimedEntity(ttl: number) {
  const e = engine.addEntity()
  LightningFx.create(e, { ttl })
  return e
}

function brightBolt(hex: string, intensity: number) {
  return {
    albedoColor: Color4.fromHexString(hex),
    emissiveColor: Color3.fromHexString(hex),
    emissiveIntensity: intensity,
    roughness: 0.05,
    metallic: 0.0
  }
}

/** One jagged bolt — short-lived, blinding white/cyan core. */
function spawnBoltMeshes(x: number, z: number, seed = Math.random()) {
  let cx = x + (seed - 0.5) * 0.4
  let cy = 18
  let cz = z + (seed - 0.5) * 0.4

  for (let i = 0; i < 14; i++) {
    const ny = Math.max(0.2, cy - (1.05 + Math.random() * 0.55))
    // Aggressive jagged offsets
    const nx = x + (Math.random() - 0.5) * 3.2
    const nz = z + (Math.random() - 0.5) * 3.2
    const mx = (cx + nx) * 0.5
    const my = (cy + ny) * 0.5
    const mz = (cz + nz) * 0.5
    const dx = nx - cx
    const dy = ny - cy
    const dz = nz - cz
    const len = Math.max(0.25, Math.sqrt(dx * dx + dy * dy + dz * dz))
    const yaw = (Math.atan2(dx, dz) * 180) / Math.PI
    const pitch = (Math.atan2(-dy, Math.sqrt(dx * dx + dz * dz)) * 180) / Math.PI

    // Hot white core
    const core = addTimedEntity(0.12 + Math.random() * 0.06)
    Transform.create(core, {
      position: Vector3.create(mx, my, mz),
      scale: Vector3.create(0.18, len, 0.18),
      rotation: Quaternion.fromEulerDegrees(pitch, yaw, (Math.random() - 0.5) * 40)
    })
    MeshRenderer.setBox(core)
    Material.setPbrMaterial(core, brightBolt('#ffffff', 22))

    // Cyan sheath
    const sheath = addTimedEntity(0.16 + Math.random() * 0.05)
    Transform.create(sheath, {
      position: Vector3.create(mx, my, mz),
      scale: Vector3.create(0.42, len * 1.02, 0.42),
      rotation: Quaternion.fromEulerDegrees(pitch, yaw, (Math.random() - 0.5) * 40)
    })
    MeshRenderer.setBox(sheath)
    Material.setPbrMaterial(sheath, brightBolt('#6af0ff', 14))

    // Occasional side branch
    if (Math.random() < 0.35 && i > 2 && i < 11) {
      const bx = mx + (Math.random() - 0.5) * 2.5
      const by = my - 0.4
      const bz = mz + (Math.random() - 0.5) * 2.5
      const branch = addTimedEntity(0.1)
      Transform.create(branch, {
        position: Vector3.create((mx + bx) * 0.5, (my + by) * 0.5, (mz + bz) * 0.5),
        scale: Vector3.create(0.1, 1.1 + Math.random(), 0.1),
        rotation: Quaternion.fromEulerDegrees(
          20 + Math.random() * 50,
          (Math.random() - 0.5) * 180,
          (Math.random() - 0.5) * 40
        )
      })
      MeshRenderer.setBox(branch)
      Material.setPbrMaterial(branch, brightBolt('#dffffa', 18))
    }

    cx = nx
    cy = ny
    cz = nz
    if (ny <= 0.25) break
  }
}

function spawnImpact(x: number, z: number) {
  const flash = addTimedEntity(0.14)
  Transform.create(flash, {
    position: Vector3.create(x, 0.2, z),
    scale: Vector3.create(3.6, 0.35, 3.6)
  })
  MeshRenderer.setCylinder(flash)
  Material.setPbrMaterial(flash, brightBolt('#ffffff', 20))

  const bloom = addTimedEntity(0.22)
  Transform.create(bloom, {
    position: Vector3.create(x, 0.35, z),
    scale: Vector3.create(5.5, 0.2, 5.5)
  })
  MeshRenderer.setCylinder(bloom)
  Material.setPbrMaterial(bloom, brightBolt('#88f7ff', 12))

  // Vertical shock column
  const column = addTimedEntity(0.1)
  Transform.create(column, {
    position: Vector3.create(x, 4, z),
    scale: Vector3.create(0.55, 8, 0.55)
  })
  MeshRenderer.setCylinder(column)
  Material.setPbrMaterial(column, brightBolt('#ffffff', 16))
}

function spawnSparks(x: number, z: number) {
  const emitter = addTimedEntity(0.55)
  Transform.create(emitter, {
    position: Vector3.create(x, 10, z)
  })
  ParticleSystem.create(emitter, {
    active: true,
    loop: false,
    rate: 0,
    maxParticles: 160,
    lifetime: 0.28,
    gravity: 40,
    billboard: true,
    blendMode: 1,
    shape: ParticleSystem.Shape.Cone({ angle: 6, radius: 0.08 }),
    initialSize: { start: 0.12, end: 0.35 },
    sizeOverTime: { start: 1.1, end: 0.05 },
    initialVelocitySpeed: { start: 16, end: 28 },
    initialColor: {
      start: Color4.create(1, 1, 1, 1),
      end: Color4.create(0.55, 0.95, 1, 1)
    },
    colorOverTime: {
      start: Color4.create(0.75, 0.98, 1, 1),
      end: Color4.create(0.4, 0.85, 1, 0)
    },
    bursts: {
      values: [
        { time: 0, count: 70, cycles: 1, interval: 0.01, probability: 1 },
        { time: 0.04, count: 50, cycles: 1, interval: 0.01, probability: 1 },
        { time: 0.09, count: 35, cycles: 1, interval: 0.01, probability: 1 }
      ]
    }
  })

  // Ground spark burst
  const ground = addTimedEntity(0.45)
  Transform.create(ground, {
    position: Vector3.create(x, 0.4, z)
  })
  ParticleSystem.create(ground, {
    active: true,
    loop: false,
    rate: 0,
    maxParticles: 80,
    lifetime: 0.35,
    gravity: -6,
    billboard: true,
    blendMode: 1,
    shape: ParticleSystem.Shape.Sphere({ radius: 0.35 }),
    initialSize: { start: 0.1, end: 0.28 },
    sizeOverTime: { start: 1, end: 0.1 },
    initialVelocitySpeed: { start: 4, end: 11 },
    initialColor: {
      start: Color4.create(1, 1, 1, 1),
      end: Color4.create(0.6, 1, 1, 0.9)
    },
    colorOverTime: {
      start: Color4.create(1, 1, 1, 0.95),
      end: Color4.create(0.3, 0.8, 1, 0)
    },
    bursts: {
      values: [{ time: 0, count: 55, cycles: 1, interval: 0.01, probability: 1 }]
    }
  })
}

function fireFlash(x: number, z: number) {
  spawnBoltMeshes(x, z, Math.random())
  spawnImpact(x, z)
  spawnSparks(x, z)
}

/**
 * Fast aggressive multi-flash lightning warning, then Fanum spawns shortly after.
 */
export function spawnLightningWarning(worldPos: Vector3) {
  const x = worldPos.x
  const z = worldPos.z

  playThudSfx()

  // Immediate first strike
  fireFlash(x, z)

  // Strobe follow-ups (very fast)
  const delays = [0.07, 0.14, 0.22]
  for (let i = 0; i < delays.length; i++) {
    const marker = engine.addEntity()
    Transform.create(marker, { position: Vector3.create(x, -20, z) })
    PendingFlash.create(marker, {
      ttl: delays[i],
      x,
      z,
      generation: i + 1
    })
  }
}

export function lightningSystem(dt: number) {
  for (const [entity] of engine.getEntitiesWith(PendingFlash)) {
    const flash = PendingFlash.getMutable(entity)
    flash.ttl -= dt
    if (flash.ttl <= 0) {
      fireFlash(flash.x, flash.z)
      engine.removeEntity(entity)
    }
  }

  for (const [entity] of engine.getEntitiesWith(LightningFx)) {
    const fx = LightningFx.getMutable(entity)
    fx.ttl -= dt
    if (fx.ttl <= 0) {
      engine.removeEntity(entity)
    }
  }
}
