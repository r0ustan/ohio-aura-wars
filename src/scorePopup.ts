import {
  Billboard,
  BillboardMode,
  engine,
  Schemas,
  TextAlignMode,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

const ScorePopup = engine.defineComponent('score-float-popup', {
  age: Schemas.Number,
  ttl: Schemas.Number,
  baseY: Schemas.Number,
  good: Schemas.Boolean
})

const GREEN = Color4.create(0.35, 1, 0.45, 1)
const RED = Color4.create(1, 0.25, 0.3, 1)

function easeOutCubic(t: number) {
  const u = 1 - t
  return 1 - u * u * u
}

/** Big expanding +/− popup over a character that floats up and fades out. */
export function spawnScorePopup(
  worldPos: Vector3,
  amount: number,
  good: boolean,
  opts?: { fontSize?: number; ttl?: number; lift?: number }
) {
  const value = Math.floor(amount)
  if (value === 0) return

  const fontSize = opts?.fontSize ?? 4.2
  const ttl = opts?.ttl ?? 1.15
  const lift = opts?.lift ?? 2.3

  const label = good ? `+${Math.abs(value)}` : `-${Math.abs(value)}`
  const entity = engine.addEntity()

  Transform.create(entity, {
    position: Vector3.create(worldPos.x, worldPos.y + lift, worldPos.z),
    scale: Vector3.create(0.35, 0.35, 0.35)
  })
  Billboard.create(entity, { billboardMode: BillboardMode.BM_Y })
  TextShape.create(entity, {
    text: label,
    fontSize,
    textColor: good ? GREEN : RED,
    outlineWidth: 0.22,
    outlineColor: Color4.Black(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  ScorePopup.create(entity, {
    age: 0,
    ttl,
    baseY: worldPos.y + lift,
    good
  })
}

export function scorePopupSystem(dt: number) {
  for (const [entity] of engine.getEntitiesWith(ScorePopup, Transform, TextShape)) {
    const fx = ScorePopup.getMutable(entity)
    fx.age += dt
    const t = Math.min(1, fx.age / fx.ttl)

    // Expand quickly, then hold while fading
    const expandT = Math.min(1, t / 0.35)
    const scale = 0.35 + easeOutCubic(expandT) * 2.0

    const fade = t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55
    const alpha = Math.max(0, fade)
    const color = fx.good
      ? Color4.create(0.35, 1, 0.45, alpha)
      : Color4.create(1, 0.25, 0.3, alpha)

    const transform = Transform.getMutable(entity)
    transform.scale = Vector3.create(scale, scale, scale)
    transform.position.y = fx.baseY + t * 1.8

    const text = TextShape.getMutable(entity)
    text.textColor = color
    text.outlineColor = Color4.create(0, 0, 0, alpha * 0.9)

    if (fx.age >= fx.ttl) {
      engine.removeEntity(entity)
    }
  }
}
