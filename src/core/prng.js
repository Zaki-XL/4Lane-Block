// @ts-check

/**
 * Crockford's Base32 類似の誤認排除文字セット (32文字 = 5ビット/文字)
 * 数字の0, 1および英字のI, Oは誤読防止のため除外
 */
const BASE32_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CHAR_MAP = new Map(Array.from(BASE32_ALPHABET).map((ch, idx) => [ch, BigInt(idx)]));

// 40-bit可逆アフィン暗号用定数 (2^40)
const MOD = 1n << 40n; // 1,099,511,627,776n
const MULT = 400913921389n;
const INV = 417994398821n; // (MULT * INV) % MOD === 1n
const ADD = 2654435761n;
const XOR_MASK = 0x5A8E7D3C19n;

/**
 * 高さ(H)とシード乱数から、外部に規則性が漏洩しない難読化ソルト文字列(8文字)を生成する
 * @param {number} height - レーンの高さ (3〜15)
 * @param {number} [seed] - 乱数シード (未指定時はランダム生成)
 * @returns {string} 難読化された8桁コード (例: "K8X2-9M4B")
 */
export function encodeObfuscatedSalt(height, seed = Math.floor(Math.random() * 0x3ffffff)) {
  const clampedHeight = Math.max(3, Math.min(18, Math.floor(height)));
  const hVal = BigInt(clampedHeight - 3) & 0xfn; // 4 bit (0~15)
  const sVal = BigInt(seed) & 0x3ffffffn; // 26 bit
  const eVal = BigInt(Math.floor(Math.random() * 32)) & 0x1fn; // 5 bit エントロピー
  const cVal = (hVal * 7n + sVal * 13n + eVal * 17n) & 0x1fn; // 5 bit チェックサム

  // 40 bit パック
  const raw = (eVal << 35n) | (hVal << 31n) | (sVal << 5n) | cVal;

  // XOR 撹拌 & 可逆アフィン変換
  const xored = (raw ^ XOR_MASK) & (MOD - 1n);
  const scrambled = (xored * MULT + ADD) % MOD;

  // Base32 (5 bit × 8文字)
  let chars = '';
  let temp = scrambled;
  for (let i = 0; i < 8; i++) {
    const digit = Number(temp & 0x1fn);
    chars = BASE32_ALPHABET[digit] + chars;
    temp >>= 5n;
  }

  // 4文字-4文字にハイフンフォーマット
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/**
 * 難読化ソルト文字列をデコードし、高さ(H)と乱数シードを復元する
 * @param {string} saltStr
 * @returns {{ height: number; seed: number; isValid: boolean }}
 */
export function decodeObfuscatedSalt(saltStr) {
  const clean = saltStr.replace(/[\s-]/g, '').toUpperCase();
  if (clean.length !== 8) {
    // 旧形式または無効な場合はフォールバック
    return {
      height: 10,
      seed: hashString(saltStr),
      isValid: false
    };
  }

  // Base32 から 40-bit 整数を復元
  let scrambled = 0n;
  for (let i = 0; i < 8; i++) {
    const val = CHAR_MAP.get(clean[i]);
    if (val === undefined) {
      return { height: 10, seed: hashString(saltStr), isValid: false };
    }
    scrambled = (scrambled << 5n) | val;
  }

  // 逆アフィン変換 & 逆XOR
  const unshifted = (scrambled - ADD) % MOD;
  const positive = unshifted < 0n ? unshifted + MOD : unshifted;
  const xored = (positive * INV) % MOD;
  const raw = (xored ^ XOR_MASK) & (MOD - 1n);

  // アンパック
  const cVal = raw & 0x1fn;
  const sVal = (raw >> 5n) & 0x3ffffffn;
  const hVal = (raw >> 31n) & 0xfn;
  const eVal = (raw >> 35n) & 0x1fn;

  // チェックサム検証
  const expectedChecksum = (hVal * 7n + sVal * 13n + eVal * 17n) & 0x1fn;
  if (cVal !== expectedChecksum) {
    return { height: 10, seed: hashString(saltStr), isValid: false };
  }

  const height = Number(hVal) + 3;
  const seed = Number(sVal);

  return { height, seed, isValid: true };
}

/**
 * 文字列から 32-bit FNV-1a ハッシュ値を生成する
 * @param {string} str - 入力文字列
 * @returns {number}
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
 */
export class Mulberry32 {
  /**
   * @param {number} seed
   */
  constructor(seed) {
    this.state = seed >>> 0;
  }

  /**
   * @returns {number}
   */
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
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
 * ランダムな難読化ソルト文字列を生成する
 * @param {number} [height=10]
 * @returns {string} (例: "K8X2-9M4B")
 */
export function generateRandomSalt(height = 10) {
  return encodeObfuscatedSalt(height);
}
