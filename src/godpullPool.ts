import { Animator, engine, Entity, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

/** Shared asset path — engine keeps one GLB in memory; entities instance it. */
export const GODPULL_SRC = 'models/Godpull.glb'
const GODPULL_CLIP = 'Animation'
/** Match former chibi footprint roughly */
const GODPULL_SCALE = 1.15

const pool: Entity[] = []
const pooled = new Set<Entity>()

function makeGodpullEntity(): Entity {
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(0, -80, 0),
    scale: Vector3.create(0, 0, 0)
  })
  GltfContainer.create(e, { src: GODPULL_SRC })
  Animator.create(e, {
    states: [
      {
        clip: GODPULL_CLIP,
        playing: false,
        loop: true,
        shouldReset: true,
        weight: 1
      }
    ]
  })
  pooled.add(e)
  return e
}

/** Warm instances so spawns don't allocate mid-fight (cap matches chibi soft cap). */
export function prewarmGodpullPool(count = 16) {
  while (pool.length < count) {
    pool.push(makeGodpullEntity())
  }
}

export function isGodpullInstance(entity: Entity): boolean {
  return pooled.has(entity)
}

/** Parent a pooled Godpull under a brainrot root and start its loop. */
export function acquireGodpull(parent: Entity): Entity {
  const e = pool.pop() ?? makeGodpullEntity()
  Transform.createOrReplace(e, {
    parent,
    position: Vector3.create(0, 0, 0),
    scale: Vector3.create(GODPULL_SCALE, GODPULL_SCALE, GODPULL_SCALE)
  })
  if (Animator.has(e)) {
    Animator.playSingleAnimation(e, GODPULL_CLIP, true)
  }
  return e
}

/** Hide and return to the pool — do not destroy the entity / reload the GLB. */
export function releaseGodpull(entity: Entity): boolean {
  if (!pooled.has(entity)) return false
  Transform.createOrReplace(entity, {
    position: Vector3.create(0, -80, 0),
    scale: Vector3.create(0, 0, 0)
  })
  if (Animator.has(entity)) {
    const anim = Animator.getMutable(entity)
    for (const state of anim.states) {
      if (state.clip === GODPULL_CLIP) state.playing = false
    }
  }
  pool.push(entity)
  return true
}
