import {
  Billboard,
  engine,
  Entity,
  Material,
  MeshCollider,
  MeshRenderer,
  ParticleSystem,
  Schemas,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { playThudSfx } from './sfxPlayer'

const BlastFx = engine.defineComponent('sigma-enemy-blast-fx', {
  ttl: Schemas.Number,
  grow: Schemas.Boolean,
  baseScale: Schemas.Number
})

/** Detached Fanum body parts flying toward the player. */
const Debris = engine.defineComponent('sigma-fanum-debris', {
  vx: Schemas.Number,
  vy: Schemas.Number,
  vz: Schemas.Number,
  spinX: Schemas.Number,
  spinY: Schemas.Number,
  spinZ: Schemas.Number,
  ttl: Schemas.Number,
  maxTtl: Schemas.Number,
  sx: Schemas.Number,
  sy: Schemas.Number,
  sz: Schemas.Number,
  cr: Schemas.Number,
  cg: Schemas.Number,
  cb: Schemas.Number,
  targetX: Schemas.Number,
  targetY: Schemas.Number,
  targetZ: Schemas.Number
})

function addTimed(ttl: number, grow = false, baseScale = 1) {
  const e = engine.addEntity()
  BlastFx.create(e, { ttl, grow, baseScale })
  return e
}

function hotMat(hex: string, intensity: number) {
  return {
    albedoColor: Color4.fromHexString(hex),
    emissiveColor: Color3.fromHexString(hex),
    emissiveIntensity: intensity,
    roughness: 0.08,
    metallic: 0
  }
}

/** Big smoke + blast shockwave when Sigma boost vaporizes a Fanum. Uses lightning thud SFX. */
export function spawnSigmaEnemyBlast(worldPos: Vector3) {
  playThudSfx()

  const x = worldPos.x
  const y = worldPos.y + 0.9
  const z = worldPos.z

  // Expanding ground shock ring
  const ring = addTimed(0.35, true, 1.2)
  Transform.create(ring, {
    position: Vector3.create(x, 0.15, z),
    scale: Vector3.create(1.2, 0.18, 1.2)
  })
  MeshRenderer.setCylinder(ring)
  Material.setPbrMaterial(ring, hotMat('#fff4a0', 18))

  const bloom = addTimed(0.28, true, 2.2)
  Transform.create(bloom, {
    position: Vector3.create(x, 0.25, z),
    scale: Vector3.create(2.2, 0.12, 2.2)
  })
  MeshRenderer.setCylinder(bloom)
  Material.setPbrMaterial(bloom, hotMat('#88f7ff', 12))

  // Vertical blast column
  const column = addTimed(0.18)
  Transform.create(column, {
    position: Vector3.create(x, 3.2, z),
    scale: Vector3.create(0.7, 6.2, 0.7)
  })
  MeshRenderer.setCylinder(column)
  Material.setPbrMaterial(column, hotMat('#ffffff', 16))

  const coreFlash = addTimed(0.12)
  Transform.create(coreFlash, {
    position: Vector3.create(x, y, z),
    scale: Vector3.create(1.8, 1.8, 1.8)
  })
  MeshRenderer.setSphere(coreFlash)
  Material.setPbrMaterial(coreFlash, hotMat('#ffffff', 22))

  // Dense smoke cloud
  const smokeCount = isMobile() ? 55 : 110
  const sparkCount = isMobile() ? 35 : 70

  const smoke = addTimed(2.2)
  Transform.create(smoke, {
    position: Vector3.create(x, y, z)
  })
  ParticleSystem.create(smoke, {
    active: true,
    loop: false,
    rate: 0,
    maxParticles: smokeCount + 20,
    lifetime: 1.5,
    gravity: -1.2,
    billboard: true,
    blendMode: 0, // alpha — thick smoke
    shape: ParticleSystem.Shape.Sphere({ radius: 0.55 }),
    initialSize: { start: 0.45, end: 1.1 },
    sizeOverTime: { start: 0.7, end: 2.4 },
    initialVelocitySpeed: { start: 1.2, end: 4.5 },
    initialColor: {
      start: Color4.create(0.55, 0.55, 0.6, 0.95),
      end: Color4.create(0.25, 0.25, 0.28, 0.75)
    },
    colorOverTime: {
      start: Color4.create(0.4, 0.4, 0.42, 0.85),
      end: Color4.create(0.15, 0.15, 0.18, 0)
    },
    bursts: {
      values: [
        { time: 0, count: smokeCount, cycles: 1, interval: 0.02, probability: 1 },
        {
          time: 0.08,
          count: Math.floor(smokeCount * 0.45),
          cycles: 1,
          interval: 0.02,
          probability: 1
        }
      ]
    }
  })

  // Hot additive blast sparks
  const sparks = addTimed(1.1)
  Transform.create(sparks, {
    position: Vector3.create(x, y, z)
  })
  ParticleSystem.create(sparks, {
    active: true,
    loop: false,
    rate: 0,
    maxParticles: sparkCount + 10,
    lifetime: 0.55,
    gravity: 2.5,
    billboard: true,
    blendMode: 1,
    shape: ParticleSystem.Shape.Sphere({ radius: 0.35 }),
    initialSize: { start: 0.12, end: 0.4 },
    sizeOverTime: { start: 1.2, end: 0.05 },
    initialVelocitySpeed: { start: 4, end: 12 },
    initialColor: {
      start: Color4.create(1, 0.95, 0.4, 1),
      end: Color4.create(1, 0.6, 0.2, 1)
    },
    colorOverTime: {
      start: Color4.create(1, 1, 0.85, 1),
      end: Color4.create(0.5, 0.85, 1, 0)
    },
    bursts: {
      values: [{ time: 0, count: sparkCount, cycles: 1, interval: 0.01, probability: 1 }]
    }
  })
}

/**
 * Unparent Fanum mesh parts into world space and fling them outward + toward the player.
 * Colliders / score labels are discarded. Call before removing the brainrot root.
 */
export function flingFanumBodyParts(
  parts: Entity[],
  rootPos: Vector3,
  rootRot: Quaternion,
  toward: Vector3
) {
  const maxParts = isMobile() ? 10 : 26
  let kept = 0

  for (const e of parts) {
    if (!Transform.has(e)) continue

    if (MeshCollider.has(e) || TextShape.has(e) || Billboard.has(e) || !MeshRenderer.has(e)) {
      engine.removeEntity(e)
      continue
    }

    if (kept >= maxParts) {
      engine.removeEntity(e)
      continue
    }
    kept++

    const local = Transform.get(e)
    const offset = Vector3.rotate(local.position, rootRot)
    const worldPos = Vector3.create(
      rootPos.x + offset.x,
      rootPos.y + offset.y,
      rootPos.z + offset.z
    )
    const worldRot = local.rotation
      ? Quaternion.multiply(rootRot, local.rotation)
      : rootRot
    const scale = Vector3.create(local.scale.x, local.scale.y, local.scale.z)

    // Toward the player / camera, plus wild scatter
    const dx = toward.x - worldPos.x
    const dy = toward.y - worldPos.y
    const dz = toward.z - worldPos.z
    const dist = Math.max(0.2, Math.sqrt(dx * dx + dy * dy + dz * dz))
    const towardSpeed = 9 + Math.random() * 10
    const scatter = 5 + Math.random() * 9
    const a = Math.random() * Math.PI * 2
    const elev = (Math.random() - 0.25) * Math.PI * 0.7

    const vx = (dx / dist) * towardSpeed + Math.cos(a) * Math.cos(elev) * scatter
    const vy = (dy / dist) * towardSpeed * 0.85 + Math.sin(elev) * scatter + 3 + Math.random() * 5
    const vz = (dz / dist) * towardSpeed + Math.sin(a) * Math.cos(elev) * scatter

    Transform.createOrReplace(e, {
      position: worldPos,
      scale,
      rotation: worldRot
    })

    const ttl = 1.15 + Math.random() * 0.85
    const shade = 0.08 + Math.random() * 0.22
    Debris.create(e, {
      vx,
      vy,
      vz,
      spinX: (Math.random() - 0.5) * 720,
      spinY: (Math.random() - 0.5) * 900,
      spinZ: (Math.random() - 0.5) * 720,
      ttl,
      maxTtl: ttl,
      sx: scale.x,
      sy: scale.y,
      sz: scale.z,
      cr: shade + Math.random() * 0.15,
      cg: shade * 0.45,
      cb: shade * 0.4,
      targetX: toward.x,
      targetY: toward.y,
      targetZ: toward.z
    })
  }
}

export function sigmaBlastSystem(dt: number) {
  for (const [entity] of engine.getEntitiesWith(BlastFx, Transform)) {
    const fx = BlastFx.getMutable(entity)
    fx.ttl -= dt
    if (fx.grow && Transform.has(entity)) {
      const t = Transform.getMutable(entity)
      const grow = 1 + (0.35 - Math.max(0, fx.ttl)) * 14
      const s = fx.baseScale * Math.max(1, grow)
      t.scale.x = s
      t.scale.z = s
    }
    if (fx.ttl <= 0) {
      engine.removeEntity(entity)
    }
  }

  for (const [entity] of engine.getEntitiesWith(Debris, Transform)) {
    const d = Debris.getMutable(entity)
    d.ttl -= dt
    if (d.ttl <= 0) {
      engine.removeEntity(entity)
      continue
    }

    // Track the live avatar so chunks keep rushing the screen
    if (Transform.has(engine.PlayerEntity)) {
      const p = Transform.get(engine.PlayerEntity).position
      d.targetX = p.x
      d.targetY = p.y + 1.35
      d.targetZ = p.z
    }

    const t = Transform.getMutable(entity)
    const life = 1 - d.ttl / d.maxTtl // 0 → 1

    // Keep pulling toward the player so chunks rush the camera
    const hx = d.targetX - t.position.x
    const hy = d.targetY - t.position.y
    const hz = d.targetZ - t.position.z
    const hlen = Math.sqrt(hx * hx + hy * hy + hz * hz)
    if (hlen > 0.15) {
      const pull = 6 + life * 10
      d.vx += (hx / hlen) * pull * dt
      d.vy += (hy / hlen) * pull * dt
      d.vz += (hz / hlen) * pull * dt
    }

    d.vy -= 6 * dt // gravity
    t.position.x += d.vx * dt
    t.position.y += d.vy * dt
    t.position.z += d.vz * dt

    t.rotation = Quaternion.multiply(
      t.rotation,
      Quaternion.fromEulerDegrees(d.spinX * dt, d.spinY * dt, d.spinZ * dt)
    )

    const shrink = Math.max(0.05, 1 - life * life)
    t.scale.x = d.sx * shrink
    t.scale.y = d.sy * shrink
    t.scale.z = d.sz * shrink

    const alpha = Math.max(0, 1 - life * 1.05)
    Material.setPbrMaterial(entity, {
      albedoColor: Color4.create(d.cr, d.cg, d.cb, alpha),
      emissiveColor: Color3.create(d.cr * 0.6, d.cg * 0.25, d.cb * 0.2),
      emissiveIntensity: 0.35 * alpha,
      roughness: 0.75,
      metallic: 0.05
    })
  }
}
