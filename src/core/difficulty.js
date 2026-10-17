// @ts-check

/**
 * 難易度レベル定義 (1〜10)
 */
export const DifficultyTitles = Object.freeze({
  1: '初心者 (Novice)',
  2: '入門 (Beginner)',
  3: '初級 (Apprentice)',
  4: '中級 (Regular)',
  5: '標準 (Standard)',
  6: '上級 (Skilled)',
  7: '熟練 (Veteran)',
  8: '達人 (Expert)',
  9: '名人 (Master)',
  10: '神話 (Mythic)'
});

/**
 * 反比例式により難易度レベルに応じた1手あたりの基準秒数を算出する
 * T(D) = 8.0 / (D + 2) + 0.4
 * @param {number} level - 難易度レベル (1〜10)
 * @returns {number} 1手あたりの基準秒数 (秒)
 */
export function calculateSecPerMove(level) {
  const d = Math.max(1, Math.min(10, Math.floor(level)));
  return 8.0 / (d + 2) + 0.4;
}

/**
 * レーンの高さ(H)から目標手数（目安クリア手数）を算出する
 * @param {number} heightLimit - レーンの高さ (3〜15)
 * @returns {number} 目標手数
 */
export function calculateTargetMoves(heightLimit) {
  const h = Math.max(3, Math.min(15, Math.floor(heightLimit)));
  // AI効率解 (0.25*H^2 + 2.5*H - 3.5) の約1.5倍を目標手数の基準とする
  const optimal = 0.25 * h * h + 2.5 * h - 3.5;
  const target = Math.round(optimal * 1.5);
  return Math.max(5, target);
}

/**
 * レーンの高さと難易度レベルから目標手数と目標タイムを算出する
 * @param {number} heightLimit - レーンの高さ (3〜15)
 * @param {number} difficultyLevel - 難易度レベル (1〜10)
 * @returns {{ targetMoves: number; secPerMove: number; targetTimeSec: number; targetTimeMs: number }}
 */
export function calculateTargets(heightLimit, difficultyLevel) {
  const targetMoves = calculateTargetMoves(heightLimit);
  const secPerMove = calculateSecPerMove(difficultyLevel);
  const targetTimeSec = Math.round(targetMoves * secPerMove);
  return {
    targetMoves,
    secPerMove: Number(secPerMove.toFixed(2)),
    targetTimeSec,
    targetTimeMs: targetTimeSec * 1000
  };
}

/**
 * リザルトの総合評価判定
 * @param {number} actualMoves - 実際の手数
 * @param {number} actualTimeMs - 実際の経過時間 (ms)
 * @param {number} heightLimit - レーン高さ
 * @param {number} difficultyLevel - 難易度レベル (1〜10)
 * @returns {{
 *   rank: 'S' | 'A' | 'B' | 'C';
 *   stars: number;
 *   title: string;
 *   isMovesAchieved: boolean;
 *   isTimeAchieved: boolean;
 *   targetMoves: number;
 *   targetTimeMs: number;
 * }}
 */
export function evaluateResult(actualMoves, actualTimeMs, heightLimit, difficultyLevel) {
  const { targetMoves, targetTimeMs } = calculateTargets(heightLimit, difficultyLevel);
  const actualTimeSec = actualTimeMs / 1000;
  const targetTimeSec = targetTimeMs / 1000;

  const isMovesAchieved = actualMoves <= targetMoves;
  const isTimeAchieved = actualTimeSec <= targetTimeSec;

  let rank = 'C';
  let stars = 1;
  let title = 'CLEAR';

  if (isMovesAchieved && isTimeAchieved) {
    rank = 'S';
    stars = 3;
    title = 'EXCELLENT!';
  } else if (isMovesAchieved || isTimeAchieved) {
    rank = 'A';
    stars = 2;
    title = 'GREAT!';
  } else {
    // どちらも超過したがクリア
    if (actualMoves <= targetMoves * 1.35 || actualTimeSec <= targetTimeSec * 1.35) {
      rank = 'B';
      stars = 2;
      title = 'GOOD';
    } else {
      rank = 'C';
      stars = 1;
      title = 'CLEARED';
    }
  }

  return {
    rank: /** @type {'S' | 'A' | 'B' | 'C'} */ (rank),
    stars,
    title,
    isMovesAchieved,
    isTimeAchieved,
    targetMoves,
    targetTimeMs
  };
}
