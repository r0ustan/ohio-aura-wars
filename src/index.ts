import { engine } from '@dcl/sdk/ecs'
import { buildArena, setBonusHandler, setHowToHandler, setStartHandler } from './arena'
import { prewarmGodpullPool } from './godpullPool'
import { setupLeaderboard } from './leaderboard'
import { fireGyattButton, gameSystem, startGame } from './systems'
import { setupUi } from './ui'
import { gameState } from './gameState'

export function main() {
  buildArena()
  // One GLB load + reusable instances for Gyatt (rarer jackpot chibi)
  prewarmGodpullPool(8)
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
