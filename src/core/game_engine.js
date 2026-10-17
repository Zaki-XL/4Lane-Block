// @ts-check
import { BlockColor } from './types.js';
import { hashString, Mulberry32, generateRandomSalt, decodeObfuscatedSalt, encodeObfuscatedSalt } from './prng.js';
import { GameTimer } from './timer.js';

/**
 * 4Lane Block コアゲームエンジン
 * 盤面状態の管理、ルール検証、確定的な難読化ソルト盤面生成、タイマー連携を提供する
 */
export class GameEngine {
  /**
   * @param {number} [heightLimit=10] レーンの高さ上限 H (デフォルト: 10)
   */
  constructor(heightLimit = 10) {
    /** @type {number} */
    this.heightLimit = heightLimit;
    /** @type {number} */
    this.difficultyLevel = 5; // 難易度レベル (1〜10、デフォルト: 5)
    /** @type {string} */
    this.salt = '';
    /** @type {[import('./types.js').Lane, import('./types.js').Lane, import('./types.js').Lane, import('./types.js').Lane]} */
    this.lanes = [[], [], [], []];
    /** @type {number | null} */
    this.selectedLaneIndex = null;
    /** @type {number} */
    this.moveCount = 0;
    /** @type {boolean} */
    this.isCleared = false;
    /** @type {GameTimer} */
    this.timer = new GameTimer();

    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map([
      ['stateChange', new Set()],
      ['timerTick', new Set()],
      ['moveSuccess', new Set()],
      ['invalidMove', new Set()],
      ['gameClear', new Set()]
    ]);

    // タイマー更新リスナーの転送
    this.timer.onTick((ms) => {
      this.emit('timerTick', ms);
    });

    // 初期難読化ソルトで盤面生成
    this.loadFromSalt(generateRandomSalt(this.heightLimit));
  }

  /**
   * 現在のゲーム状態を取得する
   * @returns {import('./types.js').GameState}
   */
  getState() {
    return {
      salt: this.salt,
      heightLimit: this.heightLimit,
      // @ts-ignore
      difficultyLevel: this.difficultyLevel,
      // @ts-ignore
      lanes: this.lanes.map((lane) => [...lane]),
      selectedLaneIndex: this.selectedLaneIndex,
      moveCount: this.moveCount,
      startTime: this.timer.startTime,
      elapsedTime: this.timer.getElapsed(),
      timerStatus: this.isCleared ? 'cleared' : (this.timer.isRunning ? 'running' : 'idle'),
      isCleared: this.isCleared
    };
  }

  /**
   * 現在のソルト文字列を取得
   * @returns {string}
   */
  getCurrentSalt() {
    return this.salt;
  }

  /**
   * ソルトを指定して盤面を確定的に初期化・再構築する
   * 難読化ソルトから高さHを自動抽出し、シード値から決定論的に盤面を生成
   * @param {string} salt
   */
  loadFromSalt(salt) {
    this.salt = salt.trim().toUpperCase();
    this.timer.reset();
    this.moveCount = 0;
    this.isCleared = false;
    this.selectedLaneIndex = null;

    // 難読化ソルトのデコード
    const decoded = decodeObfuscatedSalt(this.salt);
    if (decoded.isValid) {
      this.heightLimit = decoded.height;
    }

    const seed = decoded.isValid ? decoded.seed : hashString(this.salt);
    const prng = new Mulberry32(seed);

    let attempts = 0;
    do {
      this.generateBoard(prng);
      attempts++;
    } while (this.checkWin() && attempts < 100);

    this.emit('stateChange', this.getState());
  }

  /**
   * レーンの高さを変更し、新しい難読化ソルトで盤面を再生成する
   * @param {number} newHeight (3〜15)
   */
  setHeightLimit(newHeight) {
    const clamped = Math.max(3, Math.min(15, Math.floor(newHeight)));
    this.heightLimit = clamped;
    const newSalt = generateRandomSalt(this.heightLimit);
    this.loadFromSalt(newSalt);
  }

  /**
   * 難易度レベルを設定する (1〜10)
   * @param {number} level
   */
  setDifficultyLevel(level) {
    this.difficultyLevel = Math.max(1, Math.min(10, Math.floor(level)));
    this.emit('stateChange', this.getState());
  }

  /**
   * 現在の難易度レベルを取得
   * @returns {number}
   */
  getDifficultyLevel() {
    return this.difficultyLevel;
  }

  /**
   * 同一ソルトの初期状態にリセットする
   */
  reset() {
    this.loadFromSalt(this.salt);
  }

  /**
   * ゲームを開始し、タイマーを起動する
   */
  start() {
    if (!this.timer.isRunning && !this.isCleared) {
      this.timer.start();
      this.emit('stateChange', this.getState());
    }
  }

  /**
   * 指定レーンからブロックを持ち上げ可能か判定
   * @param {number} laneIndex
   * @returns {boolean}
   */
  canPick(laneIndex) {
    if (this.isCleared) return false;
    if (laneIndex < 0 || laneIndex >= 4) return false;
    return this.lanes[laneIndex].length > 0;
  }

  /**
   * 指定レーンの一番上のブロックを持ち上げる (Pick)
   * @param {number} laneIndex
   * @returns {boolean}
   */
  pick(laneIndex) {
    if (!this.canPick(laneIndex)) {
      this.emit('invalidMove', '選択したレーンにブロックがありません');
      return false;
    }
    // 操作開始時にタイマーが動いていなければ自動起動
    if (!this.timer.isRunning && !this.isCleared) {
      this.timer.start();
    }
    this.selectedLaneIndex = laneIndex;
    this.emit('stateChange', this.getState());
    return true;
  }

  /**
   * 指定レーンへ持ち上げ中のブロックを配置可能か判定
   * @param {number} laneIndex
   * @returns {boolean}
   */
  canDrop(laneIndex) {
    if (this.isCleared || this.selectedLaneIndex === null) return false;
    if (laneIndex < 0 || laneIndex >= 4) return false;
    // 元のレーンに戻すのはキャンセルとして常に可能
    if (this.selectedLaneIndex === laneIndex) return true;
    return this.lanes[laneIndex].length < this.heightLimit;
  }

  /**
   * 持ち上げ中のブロックを指定レーンへ配置する (Drop)
   * @param {number} laneIndex
   * @returns {boolean}
   */
  drop(laneIndex) {
    if (this.selectedLaneIndex === null) return false;

    // 同一レーンの場合はキャンセル
    if (this.selectedLaneIndex === laneIndex) {
      this.cancelPick();
      return true;
    }

    if (!this.canDrop(laneIndex)) {
      this.emit('invalidMove', '移動先レーンの高さ上限を超えています');
      return false;
    }

    const fromIndex = this.selectedLaneIndex;
    const block = this.lanes[fromIndex].pop();
    if (!block) return false;

    this.lanes[laneIndex].push(block);
    this.selectedLaneIndex = null;
    this.moveCount++;

    this.emit('moveSuccess', { from: fromIndex, to: laneIndex, block });

    // クリア判定
    if (this.checkWin()) {
      this.isCleared = true;
      const clearTime = this.timer.stop();
      this.emit('stateChange', this.getState());
      this.emit('gameClear', {
        moveCount: this.moveCount,
        elapsedTime: clearTime,
        salt: this.salt,
        difficultyLevel: this.difficultyLevel,
        heightLimit: this.heightLimit
      });
    } else {
      this.emit('stateChange', this.getState());
    }

    return true;
  }

  /**
   * 持ち上げをキャンセルして元に戻す
   */
  cancelPick() {
    if (this.selectedLaneIndex !== null) {
      this.selectedLaneIndex = null;
      this.emit('stateChange', this.getState());
    }
  }

  /**
   * 1手で指定元から指定先へブロックを直接移動する (DnD等用)
   * @param {number} fromIndex
   * @param {number} toIndex
   * @returns {boolean}
   */
  move(fromIndex, toIndex) {
    if (fromIndex === toIndex) {
      this.cancelPick();
      return true;
    }
    if (!this.canPick(fromIndex)) {
      this.emit('invalidMove', '移動元にブロックがありません');
      return false;
    }
    if (this.lanes[toIndex].length >= this.heightLimit) {
      this.emit('invalidMove', '移動先の高さ上限を超えています');
      return false;
    }

    // タイマー未起動なら起動
    if (!this.timer.isRunning && !this.isCleared) {
      this.timer.start();
    }

    const block = this.lanes[fromIndex].pop();
    if (!block) return false;

    this.lanes[toIndex].push(block);
    this.selectedLaneIndex = null;
    this.moveCount++;

    this.emit('moveSuccess', { from: fromIndex, to: toIndex, block });

    if (this.checkWin()) {
      this.isCleared = true;
      const clearTime = this.timer.stop();
      this.emit('stateChange', this.getState());
      this.emit('gameClear', {
        moveCount: this.moveCount,
        elapsedTime: clearTime,
        salt: this.salt,
        difficultyLevel: this.difficultyLevel,
        heightLimit: this.heightLimit
      });
    } else {
      this.emit('stateChange', this.getState());
    }

    return true;
  }

  /**
   * 勝利条件（クリア）を判定する
   * 4レーンのうち3レーンが単一色で満杯(高さH)、残り1レーンが空(0)
   * @returns {boolean}
   */
  checkWin() {
    let completedLanes = 0;
    let emptyLanes = 0;

    for (const lane of this.lanes) {
      if (lane.length === 0) {
        emptyLanes++;
      } else if (lane.length === this.heightLimit) {
        const firstColor = lane[0].color;
        const allSameColor = lane.every((b) => b.color === firstColor);
        if (allSameColor) {
          completedLanes++;
        }
      }
    }

    return completedLanes === 3 && emptyLanes === 1;
  }

  /**
   * PRNGを用いてブロックをシャッフルし、4レーンに配置する
   * @private
   * @param {Mulberry32} prng
   */
  generateBoard(prng) {
    // 3色のブロックを各 heightLimit 個作成 (計 3H 個)
    /** @type {import('./types.js').Block[]} */
    const blocks = [];
    const colors = [BlockColor.RED, BlockColor.BLUE, BlockColor.GREEN];
    let idCounter = 1;

    for (const color of colors) {
      for (let i = 0; i < this.heightLimit; i++) {
        blocks.push({
          id: `block_${color}_${idCounter++}`,
          color
        });
      }
    }

    // シャッフル
    prng.shuffle(blocks);

    // 4つのレーンを初期化
    /** @type {[import('./types.js').Lane, import('./types.js').Lane, import('./types.js').Lane, import('./types.js').Lane]} */
    const newLanes = [[], [], [], []];

    // 16個のスロット (4レーン × heightLimit) に対し、4つの空きスロットインデックスを決定
    const totalSlots = 4 * this.heightLimit; // 16
    const slotIndices = Array.from({ length: totalSlots }, (_, i) => i);
    prng.shuffle(slotIndices);

    // 先頭の 3H (12) 個のスロットにブロックを割り当てる
    const filledSlots = new Set(slotIndices.slice(0, blocks.length));

    let blockIdx = 0;
    for (let slot = 0; slot < totalSlots; slot++) {
      const laneIdx = Math.floor(slot / this.heightLimit);
      if (filledSlots.has(slot)) {
        newLanes[laneIdx].push(blocks[blockIdx++]);
      }
    }

    this.lanes = newLanes;
  }

  /**
   * イベント購読
   * @param {string} event
   * @param {Function} callback
   * @returns {() => void}
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  /**
   * イベント発火
   * @private
   * @param {string} event
   * @param {any} [data]
   */
  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        listener(data);
      }
    }
  }
}
