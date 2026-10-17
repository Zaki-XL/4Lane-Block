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
    glow: 'rgba(239, 68, 68, 0.4)',
    gradient: 'linear-gradient(135deg, #f87171, #dc2626)'
  },
  [BlockColor.BLUE]: {
    glow: 'rgba(59, 130, 246, 0.4)',
    gradient: 'linear-gradient(135deg, #60a5fa, #2563eb)'
  },
  [BlockColor.GREEN]: {
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

/**
 * @typedef {'marathon' | 'countup'} RTAMode
 */

/**
 * @typedef {Object} RTASplit
 * @property {number} stageIndex - ステージ番号 (0始まり)
 * @property {string} stageName - ステージ表示名 (例: "3段", "Lv 1")
 * @property {number} stageParam - マラソン時は段数、カウントアップ時は難易度Lv
 * @property {number} lapTimeMs - このステージの所要時間 (ms)
 * @property {number} totalTimeMs - 走破開始からの累積時間 (ms)
 * @property {number} moves - このステージの手数
 * @property {number} score - このステージの獲得スコア
 */

/**
 * @typedef {Object} RTARunState
 * @property {boolean} active - RTA走破中フラグ
 * @property {RTAMode} mode - 走破モード ('marathon' | 'countup')
 * @property {number} baseHeight - カウントアップ時の固定段数 (3~15)
 * @property {string} initialSalt - 走破開始時ソルト
 * @property {number} baseSeed - 走破共通乱数シード
 * @property {number} currentStageIndex - 現在のステージインデックス (0始まり)
 * @property {number} totalStages - 総ステージ数 (マラソン: 13, カウントアップ: 10)
 * @property {number} runStartTime - 走破開始タイムスタンプ (ms)
 * @property {number} currentLapStartTime - 現在ステージ開始タイムスタンプ (ms)
 * @property {number} totalElapsedMs - 走破全体の経過時間 (ms)
 * @property {number} currentLapElapsedMs - 現在ステージの経過時間 (ms)
 * @property {number} totalMoves - 走破全体の総手数
 * @property {number} totalScore - 走破全体の合計スコア
 * @property {RTASplit[]} splits - 完了済みステージのスプリット履歴
 * @property {boolean} isCompleted - 全ステージ走破完了フラグ
 */

/**
 * @typedef {Object} RTARecord
 * @property {string} mode - モード ('marathon' | 'countup')
 * @property {number} [height] - カウントアップ時の段数
 * @property {number} bestTotalTimeMs - 最速総合タイム (ms)
 * @property {number} bestScore - 最高合計スコア
 * @property {number} totalMoves - その時の総手数
 * @property {string} salt - 走破時のソルト
 * @property {string} date - 達成日時 (ISO文字列)
 * @property {RTASplit[]} splits - ベスト時のスプリット一覧
 * @property {RTARecord} [secondBest] - 2位の記録（前走ベスト等）
 */

/**
 * @typedef {Object} RTARunSaveResult
 * @property {boolean} isNewTimeRecord - 総合タイム自己ベスト更新か
 * @property {boolean} isNewScoreRecord - 総合スコア自己ベスト更新か
 * @property {boolean} isFirstRun - 初走破か
 * @property {'second' | 'best' | 'none'} compareTarget - 比較対象
 * @property {number | null} scoreDiff - スコア差分 (正: 上回る, 負: 下回る)
 * @property {number | null} timeDiffMs - タイム差分 (負: より速い, 正: より遅い)
 * @property {RTARecord | null} compareRecord - 比較対象となったレコード
 */
