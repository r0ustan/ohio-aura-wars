import ReactEcs, { Label, ReactEcsRenderer, ScreenInsetArea, UiEntity } from '@dcl/sdk/react-ecs'
import { isMobile } from '@dcl/sdk/platform'
import { Color4 } from '@dcl/sdk/math'
import { gameState } from './gameState'
import { returnToMenu } from './systems'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
}

const green = Color4.create(0.36, 1, 0.48, 1)
const red = Color4.create(1, 0.3, 0.35, 1)
const cream = Color4.create(0.96, 0.93, 1, 1)
const gold = Color4.create(1, 0.84, 0.3, 1)
const panel = Color4.create(0.08, 0.07, 0.12, 0.9)
const outline = Color4.create(0, 0, 0, 0.85)
const pinkCore = Color4.create(1, 0.3, 0.78, 1)
const pinkSoft = Color4.create(1, 0.55, 0.85, 0.95)

/** Live HUD score at top. Collect/hit world popups unchanged. */
const SCORE_BASE_SIZE = 112
const SCORE_POP_DUR = 0.14

/** Fast heartbeat: lub-dub peaks, then a short rest. */
function heartbeatScale(t: number) {
  const cycle = (t * 2.8) % 1
  const lub = Math.exp(-Math.pow(cycle * 22, 2))
  const dub = Math.exp(-Math.pow((cycle - 0.16) * 22, 2))
  return 1 + 0.16 * (lub + 0.7 * dub)
}

/** 3× pop that eases back to 1× over a split second. */
function scoreChangeScale(popRemaining: number) {
  if (popRemaining <= 0) return 1
  const t = Math.min(1, popRemaining / SCORE_POP_DUR)
  return 1 + 2 * Math.pow(t, 0.35)
}

/** Wall-style rainbow flow (h in 0..1). */
function hsvColor4(h: number, s: number, v: number, a = 1): Color4 {
  const hh = ((h % 1) + 1) % 1
  const i = Math.floor(hh * 6)
  const f = hh * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0:
      return Color4.create(v, t, p, a)
    case 1:
      return Color4.create(q, v, p, a)
    case 2:
      return Color4.create(p, v, t, a)
    case 3:
      return Color4.create(p, q, v, a)
    case 4:
      return Color4.create(t, p, v, a)
    default:
      return Color4.create(v, p, q, a)
  }
}

const OUTLINE_OFFSETS = [
  { left: -3, top: 0 },
  { left: 3, top: 0 },
  { left: 0, top: -3 },
  { left: 0, top: 3 },
  { left: -2, top: -2 },
  { left: 2, top: -2 },
  { left: -2, top: 2 },
  { left: 2, top: 2 }
]

function BigScoreLabel(props: { value: string; fontSize: number; color: Color4 }) {
  const { value, fontSize, color } = props
  const boxH = Math.max(280, Math.round(fontSize * 1.15))
  const boxW = 1100

  return (
    <UiEntity
      uiTransform={{
        width: boxW,
        height: boxH,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerFilter: 'none'
      }}
    >
      {OUTLINE_OFFSETS.map((off, i) => (
        <Label
          key={`o${i}`}
          value={value}
          fontSize={fontSize}
          color={outline}
          textAlign="middle-center"
          uiTransform={{
            width: boxW,
            height: boxH,
            positionType: 'absolute',
            position: { left: off.left, top: off.top },
            pointerFilter: 'none'
          }}
        />
      ))}
      <Label
        value={value}
        fontSize={fontSize}
        color={color}
        textAlign="middle-center"
        uiTransform={{ width: boxW, height: boxH, pointerFilter: 'none' }}
      />
    </UiEntity>
  )
}

export function uiMenu() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start'
      }}
    >
      {gameState.phase === 'playing' ? (
        <ScreenInsetArea uiTransform={{ width: '100%', height: '100%' }}>{Hud()}</ScreenInsetArea>
      ) : null}
      {gameState.phase === 'gameover' ? (
        <ScreenInsetArea uiTransform={{ width: '100%', height: '100%' }}>{GameOver()}</ScreenInsetArea>
      ) : null}
      {gameState.showHowTo && gameState.phase !== 'playing' ? (
        <ScreenInsetArea uiTransform={{ width: '100%', height: '100%' }}>{HowTo()}</ScreenInsetArea>
      ) : null}
      {gameState.chaos ? Popup() : null}
    </UiEntity>
  )
}

function HowTo() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{
          width: 820,
          height: 420,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          pointerFilter: 'block'
        }}
        uiBackground={{ color: panel }}
      >
        <Label
          value="HOW TO NOT BE AN NPC"
          fontSize={42}
          color={pinkSoft}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: 56, margin: { bottom: 24 } }}
        />
        <Label
          value="Yoink the bright ones."
          fontSize={36}
          color={green}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: 48, margin: { bottom: 8 } }}
        />
        <Label
          value="Ghost the dark Fanum tax."
          fontSize={36}
          color={red}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: 48, margin: { bottom: 8 } }}
        />
        <Label
          value="Highest peak aura = certified W."
          fontSize={36}
          color={gold}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: 48, margin: { bottom: 28 } }}
        />
        <UiEntity
          uiTransform={{
            width: 220,
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'block'
          }}
          uiBackground={{ color: pinkCore }}
          onMouseDown={() => {
            gameState.showHowTo = false
          }}
        >
          <Label
            value="GOT IT"
            fontSize={28}
            color={cream}
            textAlign="middle-center"
            uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}
          />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

function Hud() {
  const mobile = isMobile()
  const fontSize = Math.round(
    SCORE_BASE_SIZE * heartbeatScale(gameState.hudBeat) * scoreChangeScale(gameState.scorePop)
  )

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          height: 420,
          positionType: 'absolute',
          position: { top: mobile ? 8 : 4, left: 0 },
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          pointerFilter: 'none'
        }}
      >
        <BigScoreLabel
          value={`${gameState.aura}`}
          fontSize={fontSize}
          color={gameState.aura < 300 ? red : green}
        />
      </UiEntity>
    </UiEntity>
  )
}

function GameOver() {
  const rank = gameState.lastRank
  if (!rank) {
    return <UiEntity uiTransform={{ width: 1, height: 1 }} />
  }

  const t = gameState.hudBeat
  const titlePulse = 1 + 0.12 * Math.sin(t * 5.2)
  const titleSize = Math.round(70 * titlePulse)
  const peakColor = hsvColor4(t * 0.35, 0.78, 1)
  const borderPulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4.4))
  const borderGlow = Color4.create(1, 0.25 + 0.35 * borderPulse, 0.72 + 0.2 * borderPulse, 0.55 + 0.4 * borderPulse)
  const borderCore = Color4.create(1, 0.35, 0.8, 0.85 + 0.15 * borderPulse)

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      {/* Soft outer pink emission bloom */}
      <UiEntity
        uiTransform={{
          width: 1225,
          height: 725,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          pointerFilter: 'none'
        }}
        uiBackground={{ color: borderGlow }}
      >
        {/* Bright pink emission border */}
        <UiEntity
          uiTransform={{
            width: 1185,
            height: 685,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            pointerFilter: 'none'
          }}
          uiBackground={{ color: borderCore }}
        >
          {/* Inner panel */}
          <UiEntity
            uiTransform={{
              width: 1150,
              height: 650,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 60,
              pointerFilter: 'block'
            }}
            uiBackground={{ color: panel }}
          >
            <Label
              value={rank.title}
              fontSize={titleSize}
              color={pinkSoft}
              textAlign="middle-center"
              uiTransform={{ width: '100%', height: 100, margin: { bottom: 5 } }}
            />
            <Label
              value={rank.subtitle}
              fontSize={35}
              color={gold}
              textAlign="middle-center"
              uiTransform={{ width: '100%', height: 60, margin: { bottom: 25 } }}
            />
            <Label
              value={`Peak ${gameState.peakAura}`}
              fontSize={95}
              color={peakColor}
              textAlign="middle-center"
              uiTransform={{ width: '100%', height: 115, margin: { bottom: 10 } }}
            />
            <Label
              value={`Best ${gameState.bestAura}`}
              fontSize={45}
              color={gold}
              textAlign="middle-center"
              uiTransform={{ width: '100%', height: 60, margin: { bottom: 35 } }}
            />
            <UiEntity
              uiTransform={{
                width: 325,
                height: 80,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerFilter: 'block'
              }}
              uiBackground={{ color: pinkCore }}
              onMouseDown={() => {
                returnToMenu()
              }}
            >
              <Label
                value="CLOSE"
                fontSize={32}
                color={cream}
                textAlign="middle-center"
                uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}
              />
            </UiEntity>
          </UiEntity>
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

/** Center-screen chaos announcements — large & bouncy, no point values. */
function Popup() {
  const text = gameState.chaos ? gameState.chaos.text : ''
  if (!text) return null

  const bad =
    text.includes('TAX') ||
    text.includes('DRAIN') ||
    text.includes('CAMPING') ||
    text.includes('Fanum') ||
    text.includes('red')
  const bounce = 1 + 0.22 * Math.abs(Math.sin(gameState.hudBeat * 7.5))
  const fontSize = Math.round(72 * bounce)

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{
          width: 1400,
          height: 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerFilter: 'none'
        }}
      >
        {OUTLINE_OFFSETS.map((off, i) => (
          <Label
            key={`c${i}`}
            value={text}
            fontSize={fontSize}
            color={outline}
            textAlign="middle-center"
            uiTransform={{
              width: 1400,
              height: 180,
              positionType: 'absolute',
              position: { left: off.left * 2, top: off.top * 2 },
              pointerFilter: 'none'
            }}
          />
        ))}
        <Label
          value={text}
          fontSize={fontSize}
          color={bad ? red : gold}
          textAlign="middle-center"
          uiTransform={{ width: 1400, height: 180, pointerFilter: 'none' }}
        />
      </UiEntity>
    </UiEntity>
  )
}
