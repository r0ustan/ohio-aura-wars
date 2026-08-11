import {
  ColliderLayer,
  engine,
  Transform,
  TriggerArea,
  triggerAreaEventsSystem
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'

/** Safe respawn pad inside the playable floor */
const RETURN_POS = Vector3.create(24, 1.5, 24)
const RETURN_LOOK = Vector3.create(24, 1.5, 30)

let returnCooldown = 0

function returnPlayerToArena() {
  const now = Date.now()
  if (now < returnCooldown) return
  returnCooldown = now + 700
  void movePlayerTo({
    newRelativePosition: RETURN_POS,
    cameraTarget: RETURN_LOOK
  }).catch(() => undefined)
}

function addReturnTrigger(pos: Vector3, scale: Vector3) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale })
  // Local player only — no MeshRenderer (invisible catch volumes)
  TriggerArea.setBox(e, ColliderLayer.CL_MAIN_PLAYER)

  const onHit = () => returnPlayerToArena()
  triggerAreaEventsSystem.onTriggerEnter(e, onHit)
  // Stay catches death/spawn standing in the volume
  triggerAreaEventsSystem.onTriggerStay(e, onHit)
  return e
}

/**
 * Huge invisible trigger volumes ringing the outside of the arena walls,
 * plus pit + sky catchers. Always active (menu / playing / gameover).
 */
export function buildArenaReturnTriggers() {
  // Walls sit at ~0.4 / 47.6. These boxes live OUTSIDE that shell and extend
  // well past the parcel so a yeet / death respawn still hits a volume.
  const h = 48
  const y = 16
  const depth = 28
  const span = 96

  // West / east / south / north exterior slabs
  addReturnTrigger(Vector3.create(-depth / 2, y, 24), Vector3.create(depth, h, span))
  addReturnTrigger(Vector3.create(48 + depth / 2, y, 24), Vector3.create(depth, h, span))
  addReturnTrigger(Vector3.create(24, y, -depth / 2), Vector3.create(span, h, depth))
  addReturnTrigger(Vector3.create(24, y, 48 + depth / 2), Vector3.create(span, h, depth))

  // Under-floor void
  addReturnTrigger(Vector3.create(24, -10, 24), Vector3.create(span, 16, span))
  // High sky catcher (above the tall wall barriers)
  addReturnTrigger(Vector3.create(24, 40, 24), Vector3.create(span, 28, span))
}
