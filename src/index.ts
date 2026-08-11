import { engine } from '@dcl/sdk/ecs'
import { buildArena, setBonusHandler, setHowToHandler, setStartHandler } from './arena'
import { setupLeaderboard } from './leaderboard'
import { fireGyattButton, gameSystem, startGame } from './systems'
import { setupUi } from './ui'
import { gameState } from './gameState'

export function main() {
  buildArena()
  setupLeaderboard()
  setStartHandler(() => {
    startGame()
  })
  setHowToHandler(() => {
    if (gameState.phase === 'playing') return
    gameState.showHowTo = !gameState.showHowTo
  })
  setBonusHandler(() => {
    fireGyattButton()
  })
  setupUi()
  engine.addSystem(gameSystem)
}
