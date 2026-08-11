import {
  Billboard,
  BillboardMode,
  engine,
  Entity,
  Material,
  MeshRenderer,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { ceramic, glow, plastic, solid } from './materials'

export type BrainrotKind = 'rizz' | 'skibidi' | 'gyatt' | 'fanum' | 'sigma'

type PartOpts = {
  parent: Entity
  pos: Vector3
  scale: Vector3
  rot?: Vector3
  material: ReturnType<typeof solid>
  shape?: 'box' | 'sphere' | 'cylinder'
}

/** When set, every part/label created during a build is recorded for cheap destroy. */
let buildParts: Entity[] | null = null
/** Mobile LOD — fewer meshes, no billboard score tags. */
let simpleBuild = false

function track(e: Entity) {
  if (buildParts) buildParts.push(e)
  return e
}

function part(opts: PartOpts): Entity {
  const e = engine.addEntity()
  const transform: {
    parent: Entity
    position: Vector3
    scale: Vector3
    rotation?: ReturnType<typeof Quaternion.fromEulerDegrees>
  } = {
    parent: opts.parent,
    position: opts.pos,
    scale: opts.scale
  }
  if (opts.rot) {
    transform.rotation = Quaternion.fromEulerDegrees(opts.rot.x, opts.rot.y, opts.rot.z)
  }
  Transform.create(e, transform)
  if (opts.shape === 'sphere') MeshRenderer.setSphere(e)
  else if (opts.shape === 'cylinder') MeshRenderer.setCylinder(e)
  else MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, opts.material)
  return track(e)
}

/** Big anime eyes + blush for cute cast (LOD: 2 pupils only). */
function cuteFace(parent: Entity, headY: number, headZ = 0) {
  const eyeY = headY + 0.06
  const eyeZ = headZ + 0.42

  if (simpleBuild) {
    for (const x of [-0.2, 0.2]) {
      part({
        parent,
        pos: Vector3.create(x, eyeY - 0.02, eyeZ + 0.08),
        scale: Vector3.create(0.14, 0.16, 0.1),
        shape: 'sphere',
        material: solid('#1a1028', 0.9)
      })
    }
    return
  }

  for (const x of [-0.28, 0.28]) {
    part({
      parent,
      pos: Vector3.create(x, headY - 0.12, eyeZ - 0.05),
      scale: Vector3.create(0.16, 0.1, 0.06),
      shape: 'sphere',
      material: plastic('#ff8aa8', 0.55)
    })
  }

  for (const x of [-0.2, 0.2]) {
    part({
      parent,
      pos: Vector3.create(x, eyeY, eyeZ),
      scale: Vector3.create(0.28, 0.34, 0.14),
      shape: 'sphere',
      material: plastic('#ffffff', 0.2)
    })
    part({
      parent,
      pos: Vector3.create(x, eyeY - 0.02, eyeZ + 0.06),
      scale: Vector3.create(0.16, 0.18, 0.1),
      shape: 'sphere',
      material: plastic('#5ec8ff', 0.25)
    })
    part({
      parent,
      pos: Vector3.create(x, eyeY - 0.02, eyeZ + 0.11),
      scale: Vector3.create(0.08, 0.1, 0.06),
      shape: 'sphere',
      material: solid('#1a1028', 0.9)
    })
    part({
      parent,
      pos: Vector3.create(x - 0.05, eyeY + 0.08, eyeZ + 0.12),
      scale: Vector3.create(0.06, 0.07, 0.04),
      shape: 'sphere',
      material: plastic('#ffffff', 0.15)
    })
  }

  part({
    parent,
    pos: Vector3.create(0, headY - 0.22, eyeZ),
    scale: Vector3.create(0.22, 0.1, 0.08),
    shape: 'sphere',
    material: solid('#c45a72', 0.55)
  })
}

/** Hollow horror face (LOD: glowing eyes + mouth only). */
function scaryFace(parent: Entity, headY: number) {
  const eyeY = headY + 0.05
  const eyeZ = 0.4

  for (const x of [-0.22, 0.22]) {
    if (!simpleBuild) {
      part({
        parent,
        pos: Vector3.create(x, eyeY, eyeZ),
        scale: Vector3.create(0.24, 0.18, 0.12),
        shape: 'sphere',
        material: solid('#0a0505', 0.95)
      })
    }
    part({
      parent,
      pos: Vector3.create(x, eyeY, eyeZ + 0.05),
      scale: Vector3.create(simpleBuild ? 0.16 : 0.12, simpleBuild ? 0.12 : 0.08, 0.1),
      shape: 'sphere',
      material: glow('#ff1a1a', 3.2)
    })
  }

  part({
    parent,
    pos: Vector3.create(0, headY - 0.28, eyeZ),
    scale: Vector3.create(0.42, 0.14, 0.12),
    shape: 'box',
    material: solid('#120505', 0.9)
  })

  if (simpleBuild) return

  for (const x of [-0.14, -0.05, 0.05, 0.14]) {
    part({
      parent,
      pos: Vector3.create(x, headY - 0.22, eyeZ + 0.04),
      scale: Vector3.create(0.06, 0.12, 0.05),
      shape: 'box',
      material: plastic('#e8e0d0', 0.35)
    })
  }

  for (const [x, rot] of [
    [-0.22, 28],
    [0.22, -28]
  ] as const) {
    part({
      parent,
      pos: Vector3.create(x, eyeY + 0.16, eyeZ),
      scale: Vector3.create(0.24, 0.06, 0.08),
      rot: Vector3.create(0, 0, rot),
      shape: 'box',
      material: solid('#1a0808', 0.85)
    })
  }
}

function scoreTag(parent: Entity, text: string, color: string, y = 2.15) {
  if (simpleBuild) return null

  const label = engine.addEntity()
  Transform.create(label, {
    parent,
    position: Vector3.create(0, y, 0)
  })
  TextShape.create(label, {
    text,
    fontSize: 1.7,
    textColor: Color4.fromHexString(color),
    outlineWidth: 0.2,
    outlineColor: Color4.Black()
  })
  Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
  return track(label)
}

/** Super-cute chibi pink buddy */
export function buildRizzCharacter(root: Entity) {
  part({
    parent: root,
    pos: Vector3.create(0, 0.42, 0),
    scale: Vector3.create(0.78, 0.7, 0.65),
    shape: 'sphere',
    material: plastic('#ff9fd0')
  })
  part({
    parent: root,
    pos: Vector3.create(0, 1.15, 0),
    scale: Vector3.create(0.95, 0.95, 0.95),
    shape: 'sphere',
    material: plastic('#ffb7dc')
  })
  cuteFace(root, 1.15)
  if (simpleBuild) {
    scoreTag(root, '+50', '#3dff7a', 2.05)
    return
  }
  part({
    parent: root,
    pos: Vector3.create(0, 1.65, -0.05),
    scale: Vector3.create(0.85, 0.45, 0.75),
    shape: 'sphere',
    material: plastic('#ff6eb4')
  })
  part({
    parent: root,
    pos: Vector3.create(0, 0.48, 0.35),
    scale: Vector3.create(0.2, 0.18, 0.08),
    shape: 'sphere',
    material: glow('#ff4fa3', 1.6)
  })
  for (const x of [-0.52, 0.52]) {
    part({
      parent: root,
      pos: Vector3.create(x, 0.5, 0.05),
      scale: Vector3.create(0.22, 0.28, 0.22),
      rot: Vector3.create(0, 0, x < 0 ? 35 : -35),
      shape: 'sphere',
      material: plastic('#ff9fd0')
    })
  }
  for (const x of [-0.2, 0.2]) {
    part({
      parent: root,
      pos: Vector3.create(x, 0.08, 0.05),
      scale: Vector3.create(0.22, 0.16, 0.28),
      shape: 'sphere',
      material: plastic('#ff7eb8')
    })
  }
  scoreTag(root, '+50', '#3dff7a', 2.05)
}

/** Cute skibidi — friendly toilet kid */
export function buildSkibidiCharacter(root: Entity) {
  part({
    parent: root,
    pos: Vector3.create(0, 0.4, 0),
    scale: Vector3.create(1.1, 0.65, 1.1),
    shape: 'cylinder',
    material: ceramic('#f7f7fb')
  })
  if (!simpleBuild) {
    part({
      parent: root,
      pos: Vector3.create(0, 0.9, -0.5),
      scale: Vector3.create(0.9, 0.75, 0.4),
      shape: 'box',
      material: ceramic('#ececf4')
    })
    part({
      parent: root,
      pos: Vector3.create(0, 0.78, 0.05),
      scale: Vector3.create(1.0, 0.1, 1.0),
      shape: 'cylinder',
      material: plastic('#d8d8e4', 0.4)
    })
    part({
      parent: root,
      pos: Vector3.create(0, 0.62, 0.05),
      scale: Vector3.create(0.65, 0.08, 0.65),
      shape: 'cylinder',
      material: glow('#7ad7ff', 1.2, 0.15)
    })
  }
  part({
    parent: root,
    pos: Vector3.create(0, 1.35, 0.12),
    scale: Vector3.create(0.95, 0.95, 0.95),
    shape: 'sphere',
    material: plastic('#ffd4b8')
  })
  cuteFace(root, 1.35, 0.12)
  if (simpleBuild) {
    scoreTag(root, '+100', '#3dff7a', 2.25)
    return
  }
  part({
    parent: root,
    pos: Vector3.create(0, 1.85, 0.05),
    scale: Vector3.create(0.8, 0.35, 0.7),
    shape: 'sphere',
    material: solid('#4a3428', 0.7)
  })
  for (const x of [-0.65, 0.65]) {
    part({
      parent: root,
      pos: Vector3.create(x, 0.85, 0.2),
      scale: Vector3.create(0.28, 0.35, 0.28),
      shape: 'sphere',
      material: plastic('#ffd4b8')
    })
  }
  scoreTag(root, '+100', '#3dff7a', 2.25)
}

/** Cute chibi jackpot girl */
export function buildGyattCharacter(root: Entity) {
  part({
    parent: root,
    pos: Vector3.create(0, 0.45, 0),
    scale: Vector3.create(0.85, 0.8, 0.7),
    shape: 'sphere',
    material: plastic('#ff8ec8')
  })
  if (!simpleBuild) {
    part({
      parent: root,
      pos: Vector3.create(0, 0.28, 0),
      scale: Vector3.create(1.05, 0.35, 0.9),
      shape: 'sphere',
      material: plastic('#ff6eb4')
    })
  }
  part({
    parent: root,
    pos: Vector3.create(0, 1.25, 0),
    scale: Vector3.create(0.95, 0.95, 0.95),
    shape: 'sphere',
    material: plastic('#ffe0c8')
  })
  cuteFace(root, 1.25)
  if (simpleBuild) {
    scoreTag(root, '+220', '#ffe566', 2.3)
    return
  }
  for (const x of [-0.55, 0.55]) {
    part({
      parent: root,
      pos: Vector3.create(x, 1.35, -0.15),
      scale: Vector3.create(0.28, 0.7, 0.28),
      rot: Vector3.create(15, 0, x < 0 ? 25 : -25),
      shape: 'sphere',
      material: solid('#3a2030', 0.65)
    })
  }
  part({
    parent: root,
    pos: Vector3.create(0, 1.7, 0.1),
    scale: Vector3.create(0.9, 0.4, 0.7),
    shape: 'sphere',
    material: solid('#3a2030', 0.65)
  })
  for (const [x, y] of [
    [-0.65, 1.0],
    [0.7, 0.85],
    [0.55, 1.55]
  ] as const) {
    part({
      parent: root,
      pos: Vector3.create(x, y, 0.35),
      scale: Vector3.create(0.1, 0.1, 0.1),
      shape: 'sphere',
      material: glow('#ffe566', 2.2)
    })
  }
  for (const x of [-0.55, 0.55]) {
    part({
      parent: root,
      pos: Vector3.create(x, 0.55, 0.15),
      scale: Vector3.create(0.2, 0.2, 0.2),
      shape: 'sphere',
      material: plastic('#ffe0c8')
    })
  }
  scoreTag(root, '+220', '#ffe566', 2.3)
}

/** Nightmare tax collector */
export function buildFanumCharacter(root: Entity) {
  part({
    parent: root,
    pos: Vector3.create(0, 0.85, 0),
    scale: Vector3.create(0.7, 1.6, 0.55),
    shape: 'box',
    material: solid('#120808', 0.92)
  })
  if (!simpleBuild) {
    for (let i = 0; i < 3; i++) {
      part({
        parent: root,
        pos: Vector3.create(0, 0.55 + i * 0.28, 0.28),
        scale: Vector3.create(0.65, 0.08, 0.12),
        shape: 'box',
        material: solid('#2a1010', 0.8)
      })
    }
  }
  part({
    parent: root,
    pos: Vector3.create(0, 1.9, 0),
    scale: Vector3.create(0.75, 0.9, 0.7),
    shape: 'sphere',
    material: plastic('#2a1818', 0.75)
  })
  scaryFace(root, 1.9)
  part({
    parent: root,
    pos: Vector3.create(0, 1.0, 0.35),
    scale: Vector3.create(0.4, 0.4, 0.08),
    shape: 'box',
    material: glow('#39ff14', 3.5)
  })
  if (simpleBuild) {
    scoreTag(root, '-222', '#ff2244', 2.75)
    return
  }
  for (const x of [-0.28, 0.28]) {
    part({
      parent: root,
      pos: Vector3.create(x, 2.45, -0.05),
      scale: Vector3.create(0.12, 0.45, 0.12),
      rot: Vector3.create(20, 0, x < 0 ? -25 : 25),
      shape: 'cylinder',
      material: solid('#0a0505', 0.85)
    })
  }
  part({
    parent: root,
    pos: Vector3.create(0, 1.0, 0.42),
    scale: Vector3.create(0.22, 0.08, 0.05),
    shape: 'box',
    material: solid('#050805', 0.7)
  })
  part({
    parent: root,
    pos: Vector3.create(0, 1.0, 0.42),
    scale: Vector3.create(0.08, 0.22, 0.05),
    shape: 'box',
    material: solid('#050805', 0.7)
  })
  for (const x of [-0.6, 0.6]) {
    part({
      parent: root,
      pos: Vector3.create(x, 1.1, 0.1),
      scale: Vector3.create(0.18, 0.9, 0.18),
      rot: Vector3.create(25, 0, x < 0 ? 40 : -40),
      shape: 'cylinder',
      material: solid('#1a0a0a', 0.85)
    })
    part({
      parent: root,
      pos: Vector3.create(x * 1.25, 0.55, 0.35),
      scale: Vector3.create(0.12, 0.28, 0.12),
      rot: Vector3.create(50, 0, x < 0 ? 20 : -20),
      shape: 'cylinder',
      material: plastic('#c0c0c0', 0.3)
    })
  }
  for (const x of [-0.22, 0.22]) {
    part({
      parent: root,
      pos: Vector3.create(x, 0.12, 0),
      scale: Vector3.create(0.14, 0.3, 0.14),
      shape: 'cylinder',
      material: solid('#0d0606', 0.9)
    })
  }
  for (const [x, y, z] of [
    [-0.8, 1.6, -0.2],
    [0.85, 1.3, 0.1],
    [-0.5, 2.2, 0.2]
  ] as const) {
    part({
      parent: root,
      pos: Vector3.create(x, y, z),
      scale: Vector3.create(0.14, 0.14, 0.14),
      shape: 'sphere',
      material: glow('#8b0000', 2.0)
    })
  }
  scoreTag(root, '-222', '#ff2244', 2.75)
}

/** Soft cool chibi sigma — larger + emissive body; rainbow vomit on the shirt */
export function buildSigmaCharacter(root: Entity) {
  const s = 1.28
  part({
    parent: root,
    pos: Vector3.create(0, 0.5 * s, 0),
    scale: Vector3.create(0.65 * s, 0.85 * s, 0.45 * s),
    shape: 'box',
    material: glow('#2ec4b6', 2.4, 0.28)
  })
  if (!simpleBuild) {
    part({
      parent: root,
      pos: Vector3.create(0, 0.6 * s, 0.24 * s),
      scale: Vector3.create(0.2 * s, 0.55 * s, 0.05 * s),
      shape: 'box',
      material: plastic('#fff8f0', 0.35)
    })
    part({
      parent: root,
      pos: Vector3.create(0, 0.55 * s, 0.28 * s),
      scale: Vector3.create(0.08 * s, 0.35 * s, 0.05 * s),
      shape: 'box',
      material: glow('#ffd700', 3.2)
    })
  }
  // Head — no emission (skin stays matte)
  part({
    parent: root,
    pos: Vector3.create(0, 1.3 * s, 0),
    scale: Vector3.create(0.9 * s, 0.9 * s, 0.9 * s),
    shape: 'sphere',
    material: plastic('#ffe0c8')
  })
  cuteFace(root, 1.3 * s)
  // Gold frames — keep clear of Fanum black
  part({
    parent: root,
    pos: Vector3.create(0, 1.38 * s, 0.42 * s),
    scale: Vector3.create(0.7 * s, 0.2 * s, 0.14 * s),
    shape: 'box',
    material: glow('#e8c04a', 2.8, 0.25)
  })

  // Rainbow vomit streaming from mouth onto the shirt
  addSigmaRainbowVomit(root, 1.3 * s, s)

  if (simpleBuild) {
    scoreTag(root, '+320', '#ffd700', 2.2 * s)
    return
  }
  for (const x of [-0.22, 0.22]) {
    part({
      parent: root,
      pos: Vector3.create(x * s, 1.38 * s, 0.48 * s),
      scale: Vector3.create(0.28 * s, 0.22 * s, 0.08 * s),
      shape: 'sphere',
      material: glow('#4ec4ff', 2.6)
    })
  }
  part({
    parent: root,
    pos: Vector3.create(0.1 * s, 1.75 * s, -0.05 * s),
    scale: Vector3.create(0.75 * s, 0.35 * s, 0.65 * s),
    shape: 'sphere',
    material: glow('#e0b45a', 1.6, 0.4)
  })
  for (const x of [-0.45, 0.45]) {
    part({
      parent: root,
      pos: Vector3.create(x * s, 0.55 * s, 0.1 * s),
      scale: Vector3.create(0.18 * s, 0.35 * s, 0.18 * s),
      rot: Vector3.create(40, 0, x < 0 ? 15 : -15),
      shape: 'sphere',
      material: plastic('#ffe0c8')
    })
  }
  for (const x of [-0.18, 0.18]) {
    part({
      parent: root,
      pos: Vector3.create(x * s, 0.08 * s, 0.05 * s),
      scale: Vector3.create(0.2 * s, 0.12 * s, 0.28 * s),
      shape: 'box',
      material: glow('#f0d9a8', 1.1, 0.35)
    })
  }
  scoreTag(root, '+320', '#ffd700', 2.55 * s)
}

/** Glowy rainbow stream from the mouth dripping down the chest. */
function addSigmaRainbowVomit(parent: Entity, headY: number, s: number) {
  const colors = ['#ff2244', '#ff8a1a', '#ffe566', '#3dff7a', '#4ec4ff', '#c45eff', '#ff66cc']
  const mouthY = headY - 0.2
  const mouthZ = 0.5
  const count = simpleBuild ? 5 : colors.length

  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1)
    const wobble = Math.sin(i * 1.7) * 0.04 * s
    part({
      parent,
      pos: Vector3.create(wobble, mouthY - t * 0.72 * s, mouthZ - t * 0.12 * s),
      scale: Vector3.create(
        (0.1 + t * 0.12) * s,
        (0.08 + t * 0.06) * s,
        (0.1 + t * 0.1) * s
      ),
      rot: Vector3.create(18 + t * 35, wobble * 120, (i % 2 === 0 ? -1 : 1) * (8 + t * 12)),
      shape: 'sphere',
      material: glow(colors[i % colors.length], 2.4 + t, 0.25)
    })
  }

  // Shirt splats
  const splats = simpleBuild
    ? ([
        [0.02, 0.58, 0.28, '#ff2244'],
        [-0.08, 0.42, 0.26, '#3dff7a'],
        [0.1, 0.36, 0.24, '#c45eff']
      ] as const)
    : ([
        [0.02, 0.62, 0.3, '#ff2244'],
        [-0.12, 0.48, 0.28, '#ffe566'],
        [0.14, 0.44, 0.27, '#4ec4ff'],
        [-0.04, 0.34, 0.26, '#ff66cc'],
        [0.08, 0.28, 0.25, '#3dff7a'],
        [-0.1, 0.24, 0.24, '#ff8a1a']
      ] as const)

  for (const [x, y, z, hex] of splats) {
    part({
      parent,
      pos: Vector3.create(x * s, y * s, z * s),
      scale: Vector3.create(0.16 * s, 0.1 * s, 0.06 * s),
      rot: Vector3.create(70, x * 80, 12),
      shape: 'sphere',
      material: glow(hex, 2.8, 0.22)
    })
  }
}

export function buildCharacterVisual(kind: BrainrotKind, root: Entity, parts?: Entity[]) {
  buildParts = parts ?? null
  simpleBuild = isMobile()
  try {
    switch (kind) {
      case 'rizz':
        buildRizzCharacter(root)
        break
      case 'skibidi':
        buildSkibidiCharacter(root)
        break
      case 'gyatt':
        buildGyattCharacter(root)
        break
      case 'fanum':
        buildFanumCharacter(root)
        break
      case 'sigma':
        buildSigmaCharacter(root)
        break
    }
  } finally {
    buildParts = null
    simpleBuild = false
  }
}

export const KIND_META: Record<
  BrainrotKind,
  { value: number; weight: number; good: boolean }
> = {
  rizz: { value: 50, weight: 34, good: true },
  skibidi: { value: 100, weight: 26, good: true },
  gyatt: { value: 220, weight: 12, good: true },
  // Fanums spawn on a fixed global timer — keep weight 0 so ambient rolls stay positive
  fanum: { value: -222, weight: 0, good: false },
  sigma: { value: 320, weight: 1, good: true }
}
