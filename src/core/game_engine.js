// @ts-check
import { BlockColor } from './types.js';
import { hashString, Mulberry32, generateRandomSalt, decodeObfuscatedSalt, encodeObfuscatedSalt } from './prng.js';
import { GameTimer } from './timer.js';
import { saveSettings, saveRTARunResult, getRTARecord } from './storage.js';
import { evaluateResult, calculateScore } from './difficulty.js';

/**
 * 手数（MOVES）の上限値（4桁カンスト: 9999手）
 */
export const MAX_MOVES = 9999;

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

    /** @type {GameTimer} RTA全体の総合タイム計測タイマー */
    this.rtaTotalTimer = new GameTimer();
    /** @type {import('./types.js').RTARunState | null} */
    this.rtaState = null;
    /** @type {any} */
    this.rtaAdvanceTimeout = null;

    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map([
      ['stateChange', new Set()],
      ['timerTick', new Set()],
      ['moveSuccess', new Set()],
      ['invalidMove', new Set()],
      ['gameClear', new Set()],
      ['rtaStart', new Set()],
      ['rtaTick', new Set()],
      ['rtaStageClear', new Set()],
      ['rtaStageAdvance', new Set()],
      ['rtaComplete', new Set()],
      ['rtaAbort', new Set()]
    ]);

    // タイマー更新リスナーの転送
    this.timer.onTick((ms) => {
      this.emit('timerTick', ms);
    });

    // RTA総合タイマー更新リスナー
    this.rtaTotalTimer.onTick((totalMs) => {
      if (this.rtaState && this.rtaState.active) {
        this.rtaState.totalElapsedMs = totalMs;
        this.rtaState.currentLapElapsedMs = this.timer.getElapsed();
        this.emit('rtaTick', this.getRTARunState());
      }
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
    if (this.rtaState && this.rtaState.active) {
      this._cleanupRTA();
    }
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
    if (this.rtaState && this.rtaState.active) {
      this._cleanupRTA();
    }
    const clamped = Math.max(3, Math.min(15, Math.floor(newHeight)));
    this.heightLimit = clamped;
    saveSettings({ height: clamped });
    const newSalt = generateRandomSalt(this.heightLimit);
    this.loadFromSalt(newSalt);
  }

  /**
   * 難易度レベルを設定する (1〜10)
   * @param {number} level
   */
  setDifficultyLevel(level) {
    if (this.rtaState && this.rtaState.active) {
      this._cleanupRTA();
    }
    this.difficultyLevel = Math.max(1, Math.min(10, Math.floor(level)));
    saveSettings({ difficultyLevel: this.difficultyLevel });
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
   * 盤面をリセットする
   * デフォルトでは現在の段数を維持したまま新しいランダムソルトを生成して盤面を再構築する
   * @param {boolean} [randomizeSalt=true] trueなら新規ランダムソルト、falseなら同一ソルトでやり直し
   */
  reset(randomizeSalt = true) {
    if (this.rtaState && this.rtaState.active) {
      this._cleanupRTA();
    }
    if (randomizeSalt) {
      const newSalt = generateRandomSalt(this.heightLimit);
      this.loadFromSalt(newSalt);
    } else {
      this.loadFromSalt(this.salt);
    }
  }

  /**
   * ゲームを開始し、タイマーを起動する
   */
  start() {
    if (this.rtaState && this.rtaState.active) {
      this._cleanupRTA();
    }
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

    return this._executeMove(this.selectedLaneIndex, laneIndex);
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

    return this._executeMove(fromIndex, toIndex);
  }

  /**
   * ブロック移動の共通実行処理
   * @private
   * @param {number} fromIndex
   * @param {number} toIndex
   * @returns {boolean}
   */
  _executeMove(fromIndex, toIndex) {
    const block = this.lanes[fromIndex].pop();
    if (!block) return false;

    this.lanes[toIndex].push(block);
    this.selectedLaneIndex = null;
    this.moveCount = Math.min(MAX_MOVES, this.moveCount + 1);

    this.emit('moveSuccess', { from: fromIndex, to: toIndex, block });

    // クリア判定
    if (this.checkWin()) {
      this.isCleared = true;
      const clearTime = this.timer.stop();
      this.emit('stateChange', this.getState());

      if (this.rtaState && this.rtaState.active) {
        this._handleRTAClear(clearTime);
      } else {
        this.emit('gameClear', {
          moveCount: this.moveCount,
          elapsedTime: clearTime,
          salt: this.salt,
          difficultyLevel: this.difficultyLevel,
          heightLimit: this.heightLimit
        });
      }
    } else {
      this.emit('stateChange', this.getState());
    }

    return true;
  }

  // ====================================================
  // RTA (Speedrun) モード管理メソッド群
  // ====================================================

  /**
   * 現在のRTA走破状態のクローンを取得する
   * @returns {import('./types.js').RTARunState | null}
   */
  getRTARunState() {
    if (!this.rtaState) return null;
    return {
      ...this.rtaState,
      splits: [...this.rtaState.splits]
    };
  }

  /**
   * RTA走破を開始する
   * @param {import('./types.js').RTAMode} mode - 'marathon' | 'countup'
   * @param {{ baseHeight?: number; salt?: string }} [options]
   */
  startRTARun(mode, options = {}) {
    if (this.rtaAdvanceTimeout) {
      clearTimeout(this.rtaAdvanceTimeout);
      this.rtaAdvanceTimeout = null;
    }

    const baseHeight = Math.max(3, Math.min(15, Math.floor(options.baseHeight || this.heightLimit || 10)));
    let salt = (options.salt || '').trim().toUpperCase();
    if (!salt) {
      salt = generateRandomSalt(mode === 'marathon' ? 3 : baseHeight);
    }

    const decoded = decodeObfuscatedSalt(salt);
    const baseSeed = decoded.isValid ? decoded.seed : hashString(salt);
    const totalStages = mode === 'marathon' ? 13 : 10; // マラソン: 3~15段 (13面), カウントアップ: Lv1~10 (10面)

    /** @type {import('./types.js').RTARunState} */
    this.rtaState = {
      active: true,
      mode,
      baseHeight,
      initialSalt: salt,
      baseSeed,
      currentStageIndex: 0,
      totalStages,
      runStartTime: Date.now(),
      currentLapStartTime: Date.now(),
      totalElapsedMs: 0,
      currentLapElapsedMs: 0,
      totalMoves: 0,
      totalScore: 0,
      splits: [],
      isCompleted: false
    };

    // 総合タイマー・ラップタイマーリセット＆スタート
    this.rtaTotalTimer.reset();
    this.rtaTotalTimer.start();

    // 第1ステージの盤面セットアップ
    this.setupRTAStage(0);

    this.emit('rtaStart', this.getRTARunState());
  }

  /**
   * 指定インデックスのRTAステージをセットアップする
   * @param {number} stageIndex
   */
  setupRTAStage(stageIndex) {
    if (!this.rtaState || !this.rtaState.active) return;

    this.rtaState.currentStageIndex = stageIndex;
    let stageHeight = 10;
    let stageDiff = 10;
    let stageName = '';

    if (this.rtaState.mode === 'marathon') {
      // 3段〜15段 (計13ステージ)、難易度10固定
      stageHeight = 3 + stageIndex;
      stageDiff = 10;
      stageName = `${stageHeight}段`;
    } else {
      // 指定段数固定、難易度Lv1〜Lv10 (計10ステージ)
      stageHeight = this.rtaState.baseHeight;
      stageDiff = 1 + stageIndex;
      stageName = `Lv ${stageDiff}`;
    }

    this.heightLimit = stageHeight;
    this.difficultyLevel = stageDiff;

    // 同一ソルトのbaseSeedから決定論的にステージ乱数を導出
    const stageSeed = (this.rtaState.baseSeed + stageIndex * 10007) >>> 0;
    this.salt = encodeObfuscatedSalt(stageHeight, stageSeed);

    // ステージ初期化
    this.timer.reset();
    this.timer.start();
    this.moveCount = 0;
    this.isCleared = false;
    this.selectedLaneIndex = null;
    this.rtaState.currentLapStartTime = Date.now();

    const prng = new Mulberry32(stageSeed);
    let attempts = 0;
    do {
      this.generateBoard(prng);
      attempts++;
    } while (this.checkWin() && attempts < 100);

    this.emit('stateChange', this.getState());
  }

  /**
   * 次のRTAステージへ進む
   */
  advanceRTAStage() {
    if (this.rtaAdvanceTimeout) {
      clearTimeout(this.rtaAdvanceTimeout);
      this.rtaAdvanceTimeout = null;
    }
    if (!this.rtaState || !this.rtaState.active) return;

    const nextIdx = this.rtaState.currentStageIndex + 1;
    if (nextIdx < this.rtaState.totalStages) {
      this.setupRTAStage(nextIdx);
      this.emit('rtaStageAdvance', this.getRTARunState());
    }
  }

  /**
   * RTA状態の内部クリーンアップ (タイマー停止・状態破棄・イベント発火)
   * @private
   */
  _cleanupRTA() {
    if (this.rtaAdvanceTimeout) {
      clearTimeout(this.rtaAdvanceTimeout);
      this.rtaAdvanceTimeout = null;
    }
    if (this.rtaState) {
      this.rtaState.active = false;
      this.rtaState = null;
    }
    this.rtaTotalTimer.stop();
    this.timer.stop();
    this.emit('rtaAbort');
  }

  /**
   * RTA走破を中断し通常モードに戻る
   */
  abortRTARun() {
    this._cleanupRTA();
    // 通常モードとしての初期盤面へ安全に再構築
    this.reset(true);
  }

  /**
   * RTAステージクリア時の処理
   * @private
   * @param {number} lapTimeMs
   */
  _handleRTAClear(lapTimeMs) {
    if (!this.rtaState || !this.rtaState.active) return;

    const stageIdx = this.rtaState.currentStageIndex;
    const stageHeight = this.heightLimit;
    const stageDiff = this.difficultyLevel;
    const evalResult = evaluateResult(this.moveCount, lapTimeMs, stageHeight, stageDiff);
    const scoreResult = calculateScore(this.moveCount, lapTimeMs, stageHeight, stageDiff, evalResult.rank);

    const totalElapsedMs = this.rtaTotalTimer.getElapsed();
    const stageName = this.rtaState.mode === 'marathon' ? `${stageHeight}段` : `Lv ${stageDiff}`;

    /** @type {import('./types.js').RTASplit} */
    const split = {
      stageIndex: stageIdx,
      stageName,
      stageParam: this.rtaState.mode === 'marathon' ? stageHeight : stageDiff,
      lapTimeMs,
      totalTimeMs: totalElapsedMs,
      moves: this.moveCount,
      score: scoreResult.score
    };

    this.rtaState.splits.push(split);
    this.rtaState.totalMoves += this.moveCount;
    this.rtaState.totalScore += scoreResult.score;
    this.rtaState.totalElapsedMs = totalElapsedMs;

    const isFinalStage = stageIdx >= this.rtaState.totalStages - 1;

    if (isFinalStage) {
      // 走破完了！
      this.rtaTotalTimer.stop();
      this.rtaState.isCompleted = true;
      this.rtaState.active = false;

      const saveResult = saveRTARunResult({
        mode: this.rtaState.mode,
        height: this.rtaState.mode === 'countup' ? this.rtaState.baseHeight : undefined,
        totalTimeMs: totalElapsedMs,
        totalScore: this.rtaState.totalScore,
        totalMoves: this.rtaState.totalMoves,
        salt: this.rtaState.initialSalt,
        splits: this.rtaState.splits
      });

      this.emit('rtaComplete', {
        runState: this.getRTARunState(),
        result: saveResult
      });
    } else {
      // 途中ステージクリア: 短時間(0.6秒)演出後に自動次面移行
      this.emit('rtaStageClear', {
        split,
        nextStageIndex: stageIdx + 1,
        totalStages: this.rtaState.totalStages
      });

      this.rtaAdvanceTimeout = setTimeout(() => {
        this.advanceRTAStage();
      }, 600);
    }
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
