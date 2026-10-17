// @ts-check

/**
 * Cookie および LocalStorage を用いた設定・ハイスコア永続化モジュール
 */

const SETTINGS_KEY = '4lane_settings';
const HIGHSCORES_KEY = '4lane_highscores';
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
