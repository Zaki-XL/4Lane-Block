// @ts-check

/**
 * ブロックの色定義
 * @readonly
 * @enum {string}
 */
export const BlockColor = Object.freeze({
  RED: 'RED',
  BLUE: 'BLUE',
  GREEN: 'GREEN'
});

/**
 * ブロックの表示名・カラーコードマッピング
 */
export const ColorConfig = Object.freeze({
  [BlockColor.RED]: {
    name: '赤',
    hex: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.4)',
    gradient: 'linear-gradient(135deg, #f87171, #dc2626)'
  },
  [BlockColor.BLUE]: {
    name: '青',
    hex: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.4)',
    gradient: 'linear-gradient(135deg, #60a5fa, #2563eb)'
  },
  [BlockColor.GREEN]: {
    name: '緑',
    hex: '#10b981',
    glow: 'rgba(16, 185, 129, 0.4)',
    gradient: 'linear-gradient(135deg, #34d399, #059669)'
  }
});

/**
 * @typedef {Object} Block
 * @property {string} id - 一意なブロックID
 * @property {keyof typeof BlockColor} color - ブロックの色
 */

/**
 * @typedef {Block[]} Lane - レーン（スタック構造、末尾がTop）
 */

/**
 * @typedef {'idle' | 'running' | 'cleared'} TimerStatus
 */

/**
 * @typedef {Object} GameState
 * @property {string} salt - 盤面再現用ソルト
 * @property {number} heightLimit - レーンの高さ上限 H (通常4)
 * @property {[Lane, Lane, Lane, Lane]} lanes - 4つのレーン
 * @property {number | null} selectedLaneIndex - 持ち上げ中の移動元レーン番号 (0~3)
 * @property {number} moveCount - 総手数
 * @property {number | null} startTime - 開始タイムスタンプ (ms)
 * @property {number} elapsedTime - 経過時間 (ms)
 * @property {TimerStatus} timerStatus - タイマー状態
 * @property {boolean} isCleared - クリア達成フラグ
 */

/**
 * @typedef {Object} MoveEvent
 * @property {number} from - 移動元レーン番号
 * @property {number} to - 移動先レーン番号
 * @property {Block} block - 移動したブロック
 */

/**
 * @typedef {Object} GameClearResult
 * @property {number} moveCount - 総手数
 * @property {number} elapsedTime - クリアタイム (ms)
 * @property {string} salt - 盤面ソルト
 */
