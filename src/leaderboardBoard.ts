// World-space permanent top-20 aura leaderboards on all four arena walls.

import {
  engine,
  Entity,
  Transform,
  TextShape,
  MeshRenderer,
  Material,
  TextAlignMode
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { LEADERBOARD_TOP_N } from './config'

export type LeaderEntry = {
  rank: number
  walletKey: string
  displayName: string
  score: number
}

export type LeaderboardPayload = {
  sequence: number
  top: LeaderEntry[]
  updatedAtMs: number
}

const PANEL_W = 5.8
const PANEL_D = 0.14
const BORDER = 0.18
const CORNER_R = 0.18

const EDGE_PAD = 0.75
const TITLE_TO_SUB = 0.38
const TITLE_TO_BODY = 1.05
const BODY_LINE_H = 0.32
const PANEL_H_MIN = 8.2
const PANEL_H_MAX = 12.5
const BOARD_TOP_Y = 1.2 + PANEL_H_MAX

const PINK = Color4.create(1, 0.35, 0.72, 1)
const PINK_EMIT = Color3.create(1, 0.2, 0.65)
const TEXT_COLOR = Color4.create(0.95, 0.92, 0.82, 1)

const TITLE_FONT_SIZE = 2.0
const SUB_FONT_SIZE = 1.45
const BODY_FONT_SIZE = 1.85
const TEXT_SCALE = 1.35

/** One board per wall, facing inward. */
const BOARD_PLACEMENTS = [
  { x: 46.5, z: 24, yaw: 90 }, // east → face west (into arena)
  { x: 1.5, z: 24, yaw: -90 }, // west → face east (into arena)
  { x: 24, z: 46.5, yaw: 0 }, // north → face south (into arena)
  { x: 24, z: 1.5, yaw: 180 } // south → face north (into arena)
]

type FrameParts = {
  face: Entity
  top: Entity
  bottom: Entity
  left: Entity
  right: Entity
  corners: Entity[]
}

type BoardInstance = {
  root: Entity
  frame: FrameParts
  title: Entity
  sub: Entity
  body: Entity
  x: number
  z: number
}

let boards: BoardInstance[] = []
let currentPanelH = 0
let cachedPayload: LeaderboardPayload | null = null

function formatScore(n: number): string {
  const v = Math.max(0, Math.floor(Number(n) || 0))
  return v.toLocaleString('en-US')
}

function countBodyLines(payload: LeaderboardPayload | null): number {
  if (!payload || !payload.top.length) return 2
  return 1 + Math.min(LEADERBOARD_TOP_N, payload.top.length)
}

function computePanelHeight(payload: LeaderboardPayload | null): number {
  const h = EDGE_PAD + TITLE_TO_BODY + countBodyLines(payload) * BODY_LINE_H + EDGE_PAD
  return Math.min(PANEL_H_MAX, Math.max(PANEL_H_MIN, h))
}

function buildBodyText(payload: LeaderboardPayload | null): string {
  if (!payload) {
    return '──────────────\n(loading…)'
  }
  const lines: string[] = ['──────────────']
  if (!payload.top.length) {
    lines.push('(no scores yet)')
  } else {
    for (const row of payload.top.slice(0, LEADERBOARD_TOP_N)) {
      const name = (row.displayName || 'Player').slice(0, 16)
      lines.push(`${row.rank}. ${name}  ${formatScore(row.score)}`)
    }
  }
  return lines.join('\n')
}

function applyPinkEmissive(entity: Entity) {
  Material.setPbrMaterial(entity, {
    albedoColor: PINK,
    emissiveColor: PINK_EMIT,
    emissiveIntensity: 3.4,
    metallic: 0.15,
    roughness: 0.35
  })
}

function addBox(parent: Entity, position: Vector3, scale: Vector3): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position, scale })
  MeshRenderer.setBox(entity)
  return entity
}

function addCylinder(parent: Entity, position: Vector3, scale: Vector3, rotation: Quaternion): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position, scale, rotation })
  MeshRenderer.setCylinder(entity)
  return entity
}

function layoutFrame(parts: FrameParts, panelH: number) {
  const depth = PANEL_D + 0.03
  const barLenX = PANEL_W - CORNER_R * 2
  const barLenY = panelH - CORNER_R * 2
  const edgeY = panelH / 2 - BORDER / 2
  const edgeX = PANEL_W / 2 - BORDER / 2
  const cx = PANEL_W / 2 - CORNER_R
  const cy = panelH / 2 - CORNER_R

  Transform.getMutable(parts.face).scale = Vector3.create(PANEL_W - BORDER * 2, panelH - BORDER * 2, PANEL_D)
  Transform.getMutable(parts.top).position = Vector3.create(0, edgeY, 0)
  Transform.getMutable(parts.top).scale = Vector3.create(barLenX, BORDER, depth)
  Transform.getMutable(parts.bottom).position = Vector3.create(0, -edgeY, 0)
  Transform.getMutable(parts.bottom).scale = Vector3.create(barLenX, BORDER, depth)
  Transform.getMutable(parts.left).position = Vector3.create(-edgeX, 0, 0)
  Transform.getMutable(parts.left).scale = Vector3.create(BORDER, barLenY, depth)
  Transform.getMutable(parts.right).position = Vector3.create(edgeX, 0, 0)
  Transform.getMutable(parts.right).scale = Vector3.create(BORDER, barLenY, depth)

  const cornerPositions = [
    Vector3.create(cx, cy, 0),
    Vector3.create(-cx, cy, 0),
    Vector3.create(cx, -cy, 0),
    Vector3.create(-cx, -cy, 0)
  ]
  for (let i = 0; i < parts.corners.length; i++) {
    Transform.getMutable(parts.corners[i]).position = cornerPositions[i]
  }
}

function layoutText(board: BoardInstance, panelH: number) {
  const textZ = -0.1
  const topY = panelH / 2 - EDGE_PAD
  Transform.getMutable(board.title).position = Vector3.create(0, topY, textZ)
  Transform.getMutable(board.sub).position = Vector3.create(0, topY - TITLE_TO_SUB, textZ)
  Transform.getMutable(board.body).position = Vector3.create(0, topY - TITLE_TO_BODY, textZ)
}

function layoutBoard(board: BoardInstance, panelH: number) {
  Transform.getMutable(board.root).position = Vector3.create(board.x, BOARD_TOP_Y - panelH / 2, board.z)
  layoutFrame(board.frame, panelH)
  layoutText(board, panelH)
}

function spawnPanelFrame(root: Entity, panelH: number): FrameParts {
  const face = addBox(
    root,
    Vector3.create(0, 0, 0),
    Vector3.create(PANEL_W - BORDER * 2, panelH - BORDER * 2, PANEL_D)
  )
  Material.setPbrMaterial(face, {
    albedoColor: Color4.create(0.08, 0.09, 0.11, 1),
    emissiveColor: Color3.create(0.04, 0.045, 0.055),
    emissiveIntensity: 0.35,
    metallic: 0.05,
    roughness: 0.85
  })

  const depth = PANEL_D + 0.03
  const barLenX = PANEL_W - CORNER_R * 2
  const barLenY = panelH - CORNER_R * 2
  const edgeY = panelH / 2 - BORDER / 2
  const edgeX = PANEL_W / 2 - BORDER / 2

  const top = addBox(root, Vector3.create(0, edgeY, 0), Vector3.create(barLenX, BORDER, depth))
  const bottom = addBox(root, Vector3.create(0, -edgeY, 0), Vector3.create(barLenX, BORDER, depth))
  const left = addBox(root, Vector3.create(-edgeX, 0, 0), Vector3.create(BORDER, barLenY, depth))
  const right = addBox(root, Vector3.create(edgeX, 0, 0), Vector3.create(BORDER, barLenY, depth))
  for (const edge of [top, bottom, left, right]) applyPinkEmissive(edge)

  const cylRot = Quaternion.fromEulerDegrees(90, 0, 0)
  const cylScale = Vector3.create(CORNER_R * 2, depth, CORNER_R * 2)
  const cx = PANEL_W / 2 - CORNER_R
  const cy = panelH / 2 - CORNER_R
  const corners = [
    Vector3.create(cx, cy, 0),
    Vector3.create(-cx, cy, 0),
    Vector3.create(cx, -cy, 0),
    Vector3.create(-cx, -cy, 0)
  ].map((pos) => {
    const c = addCylinder(root, pos, cylScale, cylRot)
    applyPinkEmissive(c)
    return c
  })

  return { face, top, bottom, left, right, corners }
}

function spawnOneBoard(x: number, z: number, yaw: number, panelH: number): BoardInstance {
  const root = engine.addEntity()
  Transform.create(root, {
    position: Vector3.create(x, BOARD_TOP_Y - panelH / 2, z),
    rotation: Quaternion.fromEulerDegrees(0, yaw, 0)
  })

  const frame = spawnPanelFrame(root, panelH)

  const title = engine.addEntity()
  Transform.create(title, {
    parent: root,
    position: Vector3.create(0, 0, -0.1),
    scale: Vector3.create(TEXT_SCALE, TEXT_SCALE, TEXT_SCALE)
  })
  TextShape.create(title, {
    text: 'AURA LEADERBOARD',
    fontSize: TITLE_FONT_SIZE,
    textColor: TEXT_COLOR,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
    outlineWidth: 0.18,
    outlineColor: Color4.create(0.95, 0.92, 0.82, 1)
  })

  const sub = engine.addEntity()
  Transform.create(sub, {
    parent: root,
    position: Vector3.create(0, 0, -0.1),
    scale: Vector3.create(TEXT_SCALE, TEXT_SCALE, TEXT_SCALE)
  })
  TextShape.create(sub, {
    text: `TOP ${LEADERBOARD_TOP_N}  ·  ALL TIME`,
    fontSize: SUB_FONT_SIZE,
    textColor: TEXT_COLOR,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  const body = engine.addEntity()
  Transform.create(body, {
    parent: root,
    position: Vector3.create(0, 0, -0.1),
    scale: Vector3.create(TEXT_SCALE, TEXT_SCALE, TEXT_SCALE)
  })
  TextShape.create(body, {
    text: buildBodyText(null),
    fontSize: BODY_FONT_SIZE,
    textColor: TEXT_COLOR,
    textAlign: TextAlignMode.TAM_TOP_CENTER
  })

  const board: BoardInstance = { root, frame, title, sub, body, x, z }
  layoutText(board, panelH)
  return board
}

export function spawnLeaderboardBoard(): Entity {
  if (boards.length) return boards[0].root

  const panelH = computePanelHeight(null)
  currentPanelH = panelH
  boards = BOARD_PLACEMENTS.map((p) => spawnOneBoard(p.x, p.z, p.yaw, panelH))
  return boards[0].root
}

function paintBoard(payload: LeaderboardPayload | null) {
  if (!boards.length) spawnLeaderboardBoard()
  if (!boards.length) return

  const panelH = computePanelHeight(payload)
  const bodyText = buildBodyText(payload)
  const resize = Math.abs(panelH - currentPanelH) > 0.01
  if (resize) currentPanelH = panelH

  for (const board of boards) {
    if (resize) {
      layoutBoard(board, panelH)
    } else {
      layoutText(board, panelH)
    }
    TextShape.getMutable(board.body).text = bodyText
  }
}

export function applyLeaderboardPayload(payload: LeaderboardPayload | null | undefined) {
  if (!payload || typeof payload !== 'object') return
  cachedPayload = {
    sequence: Number(payload.sequence) || 0,
    updatedAtMs: Number(payload.updatedAtMs) || Date.now(),
    top: Array.isArray(payload.top) ? payload.top : []
  }
  paintBoard(cachedPayload)
}

export function getCachedLeaderboard(): LeaderboardPayload | null {
  return cachedPayload
}
