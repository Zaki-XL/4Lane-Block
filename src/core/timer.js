// ブラウザとNode.js環境両対応のRAFフォールバック
const safeRequestAnimationFrame = typeof requestAnimationFrame !== 'undefined'
  ? requestAnimationFrame
  : (cb) => /** @type {any} */ (setTimeout(cb, 16));

const safeCancelAnimationFrame = typeof cancelAnimationFrame !== 'undefined'
  ? cancelAnimationFrame
  : (id) => clearTimeout(/** @type {any} */ (id));

/**
 * タイム上限値 (ms)
 * 99分59秒99 = 99 * 60 * 1000 + 59 * 1000 + 990 = 5,999,990 ms
 */
export const MAX_TIME_MS = 5999990;

/**
 * 高精度カウントアップタイマー
 * performance.now() を基準とし、ドリフトのない正確なミリ秒経過時間を管理する
 */
export class GameTimer {
  constructor() {
    /** @type {number | null} */
    this.startTime = null;
    /** @type {number} */
    this.elapsedTime = 0;
    /** @type {boolean} */
    this.isRunning = false;
    /** @type {any} */
    this.rafId = null;
    /** @type {Set<(ms: number) => void>} */
    this.tickListeners = new Set();
  }

  /**
   * タイマーを起動してカウントアップを開始する
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = performance.now() - this.elapsedTime;
    this.loop();
  }

  /**
   * タイマーを停止する（クリア時など）
   * @returns {number} 最終確定経過時間 (ms)
   */
  stop() {
    if (!this.isRunning) return this.elapsedTime;
    this.isRunning = false;
    if (this.startTime !== null) {
      this.elapsedTime = Math.min(MAX_TIME_MS, performance.now() - this.startTime);
    }
    if (this.rafId !== null) {
      safeCancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.notify();
    return this.elapsedTime;
  }

  /**
   * タイマーを0にリセットする
   */
  reset() {
    this.stop();
    this.startTime = null;
    this.elapsedTime = 0;
    this.notify();
  }

  /**
   * 現在の経過時間を取得する (ms)
   * @returns {number}
   */
  getElapsed() {
    if (this.isRunning && this.startTime !== null) {
      return Math.min(MAX_TIME_MS, performance.now() - this.startTime);
    }
    return Math.min(MAX_TIME_MS, this.elapsedTime);
  }

  /**
   * アニメーションループで定期通知
   * @private
   */
  loop() {
    if (!this.isRunning) return;
    if (this.startTime !== null) {
      const elapsed = performance.now() - this.startTime;
      if (elapsed >= MAX_TIME_MS) {
        this.elapsedTime = MAX_TIME_MS;
        this.stop();
        return;
      }
      this.elapsedTime = elapsed;
    }
    this.notify();
    this.rafId = safeRequestAnimationFrame(() => this.loop());
  }

  /**
   * 購読リスナーへ経過時間を通知
   * @private
   */
  notify() {
    const ms = Math.floor(this.elapsedTime);
    for (const listener of this.tickListeners) {
      listener(ms);
    }
  }

  /**
   * 毎フレームの経過時間更新イベントを購読する
   * @param {(ms: number) => void} callback
   * @returns {() => void} 購読解除関数
   */
  onTick(callback) {
    this.tickListeners.add(callback);
    return () => this.tickListeners.delete(callback);
  }

  /**
   * ミリ秒を "MM:SS.ss" 形式の文字列にフォーマットする
   * @param {number} ms
   * @returns {string}
   */
  static formatTime(ms) {
    const clampedMs = Math.min(MAX_TIME_MS, Math.max(0, ms));
    const totalSeconds = clampedMs / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const centiseconds = Math.floor((clampedMs % 1000) / 10);

    const mStr = String(minutes).padStart(2, '0');
    const sStr = String(seconds).padStart(2, '0');
    const cStr = String(centiseconds).padStart(2, '0');

    return `${mStr}:${sStr}.${cStr}`;
  }
}
