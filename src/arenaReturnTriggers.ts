import {
  ColliderLayer,
  engine,
  Transform,
  TriggerArea,
  triggerAreaEventsSystem
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { gameState } from './gameState'

/** Matches scene.json default spawn (mid-arena pad) */
export const SPAWN_POS = Vector3.create(24, 1.5, 24)
export const SPAWN_LOOK = Vector3.create(24, 1.5, 30)

const RETURN_LINES = [
  'NO CAP YOU CLIPPED OUT OF OHIO',
  'L + RATIO + TOUCH GRASS + COME BACK',
  'SKIBIDI SENT YOU TO THE SHADOW REALM',
  'FANUM TAXED YOUR COORDINATES',
  'GYATT YOU OUTTA BOUNDS FR FR',
  'SIGMA RULE #0: STAY IN THE BOX',
  'WHAT THE SIGMA — REALITY CHECK',
  'OHIO CALLED. IT WANTS YOU BACK.',
  'RIZZ LEVELS TOO HIGH. REBOOTED.',
  'YOU LEFT THE BRAINROT DIMENSION'
]

let returnCooldown = 0

function returnPlayerToSpawn() {
  const now = Date.now()
  if (now < returnCooldown) return
  returnCooldown = now + 700

  const line = RETURN_LINES[Math.floor(Math.random() * RETURN_LINES.length)]
  gameState.chaos = { text: line, ttl: 1.8 }
  gameState.announcementFlash = 0.3

  void movePlayerTo({
    newRelativePosition: SPAWN_POS,
    cameraTarget: SPAWN_LOOK
  }).catch(() => undefined)
}

function addReturnTrigger(pos: Vector3, scale: Vector3) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale })
  // Local player only — invisible catch volumes strictly OUTSIDE the walls
  TriggerArea.setBox(e, ColliderLayer.CL_MAIN_PLAYER)

  const onHit = () => returnPlayerToSpawn()
  triggerAreaEventsSystem.onTriggerEnter(e, onHit)
  triggerAreaEventsSystem.onTriggerStay(e, onHit)
  return e
}

/**
 * Invisible trigger volumes ONLY outside the arena shell (walls ~0.4 / 47.6).
 * Intentionally leave a gap so standing inside near corners never fires.
 */
export function buildArenaReturnTriggers() {
  const h = 48
  const y = 16
  // Outer face of each slab sits at least ~1.5m outside the wall line
  const depth = 30
  const span = 100
  const gap = 1.5 // clear air between wall outer face and trigger inner face

  // West: wall at x=0.4 → trigger ends at 0.4 - gap = -1.1
  addReturnTrigger(
    Vector3.create(0.4 - gap - depth / 2, y, 24),
    Vector3.create(depth, h, span)
  )
  // East: wall at x=47.6 → trigger starts at 47.6 + gap
  addReturnTrigger(
    Vector3.create(47.6 + gap + depth / 2, y, 24),
    Vector3.create(depth, h, span)
  )
  // South: wall at z=0.4
  addReturnTrigger(
    Vector3.create(24, y, 0.4 - gap - depth / 2),
    Vector3.create(span, h, depth)
  )
  // North: wall at z=47.6
  addReturnTrigger(
    Vector3.create(24, y, 47.6 + gap + depth / 2),
    Vector3.create(span, h, depth)
  )

  // Under-floor void only (does not cover playable y)
  addReturnTrigger(Vector3.create(24, -12, 24), Vector3.create(span, 18, span))
  // Sky catcher well above jump / barrier height (~22)
  addReturnTrigger(Vector3.create(24, 48, 24), Vector3.create(span, 30, span))
}
