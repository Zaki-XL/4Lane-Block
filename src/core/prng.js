// @ts-check

/**
 * 文字列から 32-bit FNV-1a ハッシュ値を生成する
 * @param {string} str - 入力文字列（ソルト）
 * @returns {number} 32-bit 正の整数シード
 */
export function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 決定論的擬似乱数生成器 (Mulberry32)
 * 高速かつブラウザや実行環境を問わず完全に同一の乱数列を保証する
 */
export class Mulberry32 {
  /**
   * @param {number} seed - 32-bit 整数シード
   */
  constructor(seed) {
    this.state = seed >>> 0;
  }

  /**
   * 0以上1未満の擬似乱数を返す
   * @returns {number}
   */
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * min以上max以下の整数乱数を返す
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Fisher-Yates アルゴリズムを用いて配列をインプレースでシャッフルする
   * @template T
   * @param {T[]} array
   * @returns {T[]}
   */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

/**
 * ランダムなソルト文字列を生成する (例: "4LB-A8X2")
 * @returns {string}
 */
export function generateRandomSalt() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 誤読しやすい 0, 1, I, O を除外
  let code = '';
  for (let i = 0; i < 4; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  return `4LB-${code}`;
}
