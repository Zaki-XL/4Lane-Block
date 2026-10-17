// @ts-check

/**
 * Cookie および LocalStorage を用いた設定・ハイスコア永続化モジュール
 */

const SETTINGS_KEY = '4lane_settings';
const HIGHSCORES_KEY = '4lane_highscores';
const LANG_KEY = '4lane_language';
const ONE_YEAR_SEC = 31536000;

/**
 * Cookie から値を取得
 * @param {string} name
 * @returns {string | null}
 */
function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + encodeURIComponent(name) + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Cookie に値を保存 (有効期限1年)
 * @param {string} name
 * @param {string} value
 */
function setCookie(name, value) {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=${ONE_YEAR_SEC}; path=/; SameSite=Lax`;
}

// Node.js テスト環境またはCookie/LocalStorage非対応環境用のインメモリフォールバック
const inMemoryCache = new Map();

/**
 * ストレージからJSONデータを読み出す (Cookie優先、LocalStorageフォールバック、インメモリ)
 * @param {string} key
 * @returns {any | null}
 */
function loadData(key) {
  try {
    // 1. Cookie から試行
    const cookieVal = getCookie(key);
    if (cookieVal) {
      return JSON.parse(cookieVal);
    }
    // 2. LocalStorage フォールバック (file:/// や Cookie 無効時)
    if (typeof localStorage !== 'undefined') {
      const lsVal = localStorage.getItem(key);
      if (lsVal) return JSON.parse(lsVal);
    }
    // 3. インメモリキャッシュ
    if (inMemoryCache.has(key)) {
      return inMemoryCache.get(key);
    }
  } catch (err) {
    console.warn(`[Storage] Failed to read ${key}:`, err);
  }
  return null;
}

/**
 * ストレージへJSONデータを保存 (Cookie & LocalStorage & インメモリ同期)
 * @param {string} key
 * @param {any} data
 */
function saveData(key, data) {
  try {
    const jsonStr = JSON.stringify(data);
    setCookie(key, jsonStr);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, jsonStr);
    }
    inMemoryCache.set(key, JSON.parse(jsonStr));
  } catch (err) {
    console.warn(`[Storage] Failed to save ${key}:`, err);
  }
}


/**
 * ユーザーの前回設定を取得 (段数・難易度)
 * @returns {{ height: number, difficultyLevel: number }}
 */
export function getSavedSettings() {
  const data = loadData(SETTINGS_KEY);
  return {
    height: (data && typeof data.height === 'number') ? data.height : 10,
    difficultyLevel: (data && typeof data.difficultyLevel === 'number') ? data.difficultyLevel : 5
  };
}

/**
 * ユーザー設定を保存
 * @param {{ height?: number, difficultyLevel?: number }} settings
 */
export function saveSettings(settings) {
  const current = getSavedSettings();
  const updated = {
    height: typeof settings.height === 'number' ? settings.height : current.height,
    difficultyLevel: typeof settings.difficultyLevel === 'number' ? settings.difficultyLevel : current.difficultyLevel
  };
  saveData(SETTINGS_KEY, updated);
}

/**
 * 保存された言語設定を取得
 * @returns {string | null}
 */
export function getSavedLanguage() {
  const cookieVal = getCookie(LANG_KEY);
  if (cookieVal) return cookieVal;
  if (typeof localStorage !== 'undefined') {
    const lsVal = localStorage.getItem(LANG_KEY);
    if (lsVal) return lsVal;
  }
  return inMemoryCache.get(LANG_KEY) || null;
}

/**
 * 言語設定を保存
 * @param {string} lang
 */
export function saveLanguage(lang) {
  setCookie(LANG_KEY, lang);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LANG_KEY, lang);
  }
  inMemoryCache.set(LANG_KEY, lang);
}

/**
 * 段数と難易度の組み合わせキーを生成
 * @param {number} height
 * @param {number} level
 * @returns {string}
 */
export function getScoreKey(height, level) {
  const h = Math.max(3, Math.min(15, Math.floor(height || 10)));
  const d = Math.max(1, Math.min(10, Math.floor(level || 5)));
  return `h${h}_d${d}`;
}

/**
 * 全てのハイスコアマップを取得
 * @returns {Record<string, { score: number, moves: number, timeMs: number, date: string, height: number, level: number }>}
 */
export function getAllHighScores() {
  return loadData(HIGHSCORES_KEY) || {};
}

/**
 * 指定段数・指定難易度のハイスコアを取得
 * @param {number} height (3〜15)
 * @param {number} level (1〜10)
 * @returns {{ score: number, moves: number, timeMs: number, date: string, height: number, level: number } | null}
 */
export function getHighScore(height, level) {
  const all = getAllHighScores();
  const key = getScoreKey(height, level);
  if (all[key]) {
    return all[key];
  }
  // 後方互換フォールバック: 旧来の難易度単体キー (level) があれば参照
  if (all[level]) {
    return all[level];
  }
  return null;
}

/**
 * 指定段数・難易度での新しい記録を判定・保存する
 * @param {number} height
 * @param {number} level
 * @param {number} score
 * @param {number} moves
 * @param {number} timeMs
 * @returns {{ isNewRecord: boolean, previousBest: number, currentScore: number }}
 */
export function checkAndSaveHighScore(height, level, score, moves, timeMs) {
  const all = getAllHighScores();
  const key = getScoreKey(height, level);
  const prev = all[key] || all[level]; // 旧データも比較対象
  const prevScore = prev ? prev.score : 0;

  if (score > prevScore) {
    all[key] = {
      score,
      moves,
      timeMs,
      height,
      level,
      date: new Date().toISOString()
    };
    saveData(HIGHSCORES_KEY, all);
    return { isNewRecord: true, previousBest: prevScore, currentScore: score };
  }

  return { isNewRecord: false, previousBest: prevScore, currentScore: score };
}


/**
 * 全てのハイスコアを完全に消去する
 */
export function resetAllHighScores() {
  saveData(HIGHSCORES_KEY, {});
}

/**
 * 保存されているハイスコアをソート済み配列として取得
 * @returns {Array<{ height: number, level: number, score: number, moves: number, timeMs: number, date: string }>}
 */
export function getAllHighScoreList() {
  const all = getAllHighScores();
  const list = [];
  for (const [key, item] of Object.entries(all)) {
    if (item && typeof item === 'object' && item.score) {
      list.push({
        height: item.height || 10,
        level: item.level || 5,
        score: item.score,
        moves: item.moves,
        timeMs: item.timeMs,
        date: item.date || ''
      });
    }
  }
  return list.sort((a, b) => (a.height === b.height ? a.level - b.level : a.height - b.height));
}

// ----------------------------------------------------
// RTA (Speedrun) レコード管理
// ----------------------------------------------------
const RTA_RECORDS_KEY = '4lane_rta_records';

/**
 * 全てのRTAレコードを取得
 * @returns {{ marathon?: import('./types.js').RTARecord, countup?: Record<string, import('./types.js').RTARecord> }}
 */
export function getAllRTARecords() {
  const data = loadData(RTA_RECORDS_KEY);
  if (data && typeof data === 'object') {
    return data;
  }
  return { marathon: undefined, countup: {} };
}

/**
 * 指定モードのベストRTAレコードを取得
 * @param {'marathon' | 'countup'} mode
 * @param {number} [height] - カウントアップ時のみ必須 (3~15)
 * @returns {import('./types.js').RTARecord | null}
 */
export function getRTARecord(mode, height) {
  const all = getAllRTARecords();
  if (mode === 'marathon') {
    return all.marathon || null;
  }
  if (mode === 'countup') {
    const hKey = `h${height || 10}`;
    return (all.countup && all.countup[hKey]) || null;
  }
  return null;
}

/**
 * RTA走破完了時に記録を検証・保存する
 * @param {{
 *   mode: 'marathon' | 'countup';
 *   height?: number;
 *   totalTimeMs: number;
 *   totalScore: number;
 *   totalMoves: number;
 *   salt: string;
 *   splits: import('./types.js').RTASplit[];
 * }} run
 * @returns {{
/**
 * RTA走破完了時に記録を検証・保存し、比較対象（ベストまたは2位）との差分を算出する
 * @param {{
 *   mode: 'marathon' | 'countup';
 *   height?: number;
 *   totalTimeMs: number;
 *   totalScore: number;
 *   totalMoves: number;
 *   salt: string;
 *   splits: import('./types.js').RTASplit[];
 * }} run
 * @returns {import('./types.js').RTARunSaveResult}
 */
export function saveRTARunResult(run) {
  const all = getAllRTARecords();
  if (!all.countup) all.countup = {};

  const currentBest = getRTARecord(run.mode, run.height);

  let isNewTimeRecord = false;
  let isNewScoreRecord = false;
  let isFirstRun = false;
  /** @type {'second' | 'best' | 'none'} */
  let compareTarget = 'none';
  /** @type {number | null} */
  let scoreDiff = null;
  /** @type {number | null} */
  let timeDiffMs = null;
  /** @type {import('./types.js').RTARecord | null} */
  let compareRecord = null;

  if (!currentBest) {
    // 1. 初走破
    isFirstRun = true;
    isNewTimeRecord = true;
    isNewScoreRecord = true;
    compareTarget = 'none';

    /** @type {import('./types.js').RTARecord} */
    const newRecord = {
      mode: run.mode,
      height: run.mode === 'countup' ? run.height : undefined,
      bestTotalTimeMs: run.totalTimeMs,
      bestScore: run.totalScore,
      totalMoves: run.totalMoves,
      salt: run.salt,
      date: new Date().toISOString(),
      splits: run.splits
    };

    if (run.mode === 'marathon') {
      all.marathon = newRecord;
    } else {
      const hKey = `h${run.height || 10}`;
      all.countup[hKey] = newRecord;
    }
    saveData(RTA_RECORDS_KEY, all);
  } else {
    // 2. 過去記録あり
    isNewTimeRecord = run.totalTimeMs < currentBest.bestTotalTimeMs;
    isNewScoreRecord = run.totalScore > currentBest.bestScore;

    if (isNewScoreRecord) {
      // ベストスコア更新！ -> 比較対象は「旧1位（2位へ降格する記録）」
      compareTarget = 'second';
      scoreDiff = run.totalScore - currentBest.bestScore;
      timeDiffMs = run.totalTimeMs - currentBest.bestTotalTimeMs;
      compareRecord = { ...currentBest };

      /** @type {import('./types.js').RTARecord} */
      const newRecord = {
        mode: run.mode,
        height: run.mode === 'countup' ? run.height : undefined,
        bestTotalTimeMs: isNewTimeRecord ? run.totalTimeMs : currentBest.bestTotalTimeMs,
        bestScore: run.totalScore,
        totalMoves: run.totalMoves,
        salt: run.salt,
        date: new Date().toISOString(),
        splits: run.splits,
        secondBest: {
          mode: currentBest.mode,
          height: currentBest.height,
          bestTotalTimeMs: currentBest.bestTotalTimeMs,
          bestScore: currentBest.bestScore,
          totalMoves: currentBest.totalMoves,
          salt: currentBest.salt,
          date: currentBest.date,
          splits: currentBest.splits
        }
      };

      if (run.mode === 'marathon') {
        all.marathon = newRecord;
      } else {
        const hKey = `h${run.height || 10}`;
        all.countup[hKey] = newRecord;
      }
      saveData(RTA_RECORDS_KEY, all);
    } else {
      // ベストスコア未更新 -> 比較対象は「1位（自己ベスト）」
      compareTarget = 'best';
      scoreDiff = run.totalScore - currentBest.bestScore;
      timeDiffMs = run.totalTimeMs - currentBest.bestTotalTimeMs;
      compareRecord = { ...currentBest };

      // タイム更新があれば1位レコードの最速タイムを更新
      if (isNewTimeRecord) {
        currentBest.bestTotalTimeMs = run.totalTimeMs;
      }

      // 2位記録（secondBest）の判定・更新
      const currentSecond = currentBest.secondBest;
      if (!currentSecond || run.totalScore > currentSecond.bestScore) {
        currentBest.secondBest = {
          mode: run.mode,
          height: run.mode === 'countup' ? run.height : undefined,
          bestTotalTimeMs: run.totalTimeMs,
          bestScore: run.totalScore,
          totalMoves: run.totalMoves,
          salt: run.salt,
          date: new Date().toISOString(),
          splits: run.splits
        };
      }

      if (run.mode === 'marathon') {
        all.marathon = currentBest;
      } else {
        const hKey = `h${run.height || 10}`;
        all.countup[hKey] = currentBest;
      }
      saveData(RTA_RECORDS_KEY, all);
    }
  }

  return {
    isNewTimeRecord,
    isNewScoreRecord,
    isFirstRun,
    compareTarget,
    scoreDiff,
    timeDiffMs,
    compareRecord
  };
}

/**
 * 全てのRTA記録を初期化する
 */
export function resetAllRTARecords() {
  saveData(RTA_RECORDS_KEY, { marathon: undefined, countup: {} });
}
