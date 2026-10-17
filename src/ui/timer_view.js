// @ts-check
import { GameTimer } from '../core/timer.js';
import { GameEngine } from '../core/game_engine.js';
import { generateRandomSalt } from '../core/prng.js';
import { DifficultyTitles, calculateTargets } from '../core/difficulty.js';

/**
 * タイマーおよびコントロールパネルのUIビュー (画面上部HUD)
 */
export class TimerAndControlView {
  /**
   * @param {GameEngine} engine
   * @param {HTMLElement} element
   */
  constructor(engine, element) {
    this.engine = engine;
    this.element = element;

    this.render();
    this.bindEvents();
  }

  /**
   * UIの描画 (プレイ用のすっきりしたHUD)
   */
  render() {
    const state = this.engine.getState();
    const currentHeight = state.heightLimit;
    const currentDiff = state.difficultyLevel || 5;
    const targets = calculateTargets(currentHeight, currentDiff);

    this.element.innerHTML = `
      <div class="hud-container">
        <div class="hud-stats">
          <div class="stat-card">
            <span class="stat-label">TIME</span>
            <span class="stat-value" id="timer-display">00:00.00</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">MOVES</span>
            <span class="stat-value" id="moves-display">0 手</span>
          </div>
          <div class="stat-card stat-target-card">
            <span class="stat-label">TARGET 🎯</span>
            <span class="stat-target-val" id="hud-target-text">
              <strong id="target-moves-text">${targets.targetMoves}手</strong> / <strong id="target-time-text">${GameTimer.formatTime(targets.targetTimeMs)}</strong>
            </span>
          </div>
          <div class="stat-card stat-config-card">
            <span class="stat-label">CONFIG ⚙️</span>
            <div class="config-summary-badges">
              <span class="config-pill" id="hud-height-pill">${currentHeight}段</span>
              <span class="config-pill" id="hud-diff-pill">Lv${currentDiff} ${DifficultyTitles[currentDiff]?.split(' ')[0]}</span>
              <span class="config-pill salt-pill" id="hud-salt-pill" title="クリックして共有URLをコピー">${state.salt || '------'}</span>
            </div>
          </div>
        </div>

        <div class="hud-actions">
          <button id="reset-game-btn" class="btn btn-sm btn-outline" title="初期状態からやり直す">🔄 リトライ</button>
          <button id="open-config-btn" class="btn btn-sm btn-secondary" title="難易度・段数・ソルトを変更して新ゲーム">⚙ 設定・新規</button>
        </div>
      </div>
    `;

    this.timerDisplay = this.element.querySelector('#timer-display');
    this.movesDisplay = this.element.querySelector('#moves-display');
    this.targetMovesText = this.element.querySelector('#target-moves-text');
    this.targetTimeText = this.element.querySelector('#target-time-text');
    this.hudHeightPill = this.element.querySelector('#hud-height-pill');
    this.hudDiffPill = this.element.querySelector('#hud-diff-pill');
    this.hudSaltPill = this.element.querySelector('#hud-salt-pill');
  }

  /**
   * 各種イベントリスナーを登録
   */
  bindEvents() {
    // タイマー更新リスナー
    this.engine.on('timerTick', (ms) => {
      if (this.timerDisplay) {
        this.timerDisplay.textContent = GameTimer.formatTime(ms);
      }
    });

    // 状態更新リスナー
    this.engine.on('stateChange', (state) => {
      if (this.movesDisplay) {
        this.movesDisplay.textContent = `${state.moveCount} 手`;
      }
      if (this.timerDisplay) {
        this.timerDisplay.textContent = GameTimer.formatTime(state.elapsedTime);
      }

      // バッジ表示の更新
      const currentDiff = state.difficultyLevel || 5;
      const targets = calculateTargets(state.heightLimit, currentDiff);
      if (this.targetMovesText) this.targetMovesText.textContent = `${targets.targetMoves}手`;
      if (this.targetTimeText) this.targetTimeText.textContent = GameTimer.formatTime(targets.targetTimeMs);
      if (this.hudHeightPill) this.hudHeightPill.textContent = `${state.heightLimit}段`;
      if (this.hudDiffPill) {
        const titleShort = DifficultyTitles[currentDiff]?.split(' ')[0] || '';
        this.hudDiffPill.textContent = `Lv${currentDiff} ${titleShort}`;
      }
      if (this.hudSaltPill) {
        this.hudSaltPill.textContent = state.salt || '------';
      }
    });

    // リセットボタン (現在の盤面をリトライし、待機状態にする)
    const resetGameBtn = this.element.querySelector('#reset-game-btn');
    resetGameBtn?.addEventListener('click', () => {
      this.engine.reset();
    });

    // ⚙ 設定・新規ボタン (待機状態に戻して設定コンソールを開く)
    const openConfigBtn = this.element.querySelector('#open-config-btn');
    openConfigBtn?.addEventListener('click', () => {
      this.engine.reset();
    });

    // ソルトバッジクリックで共有URLをコピー
    this.hudSaltPill?.addEventListener('click', async () => {
      const currentSalt = this.engine.getCurrentSalt();
      const shareUrl = `${window.location.origin}${window.location.pathname}?salt=${encodeURIComponent(currentSalt)}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        const originalText = this.hudSaltPill?.textContent;
        if (this.hudSaltPill) {
          this.hudSaltPill.textContent = 'コピー完了!';
          setTimeout(() => {
            if (this.hudSaltPill) this.hudSaltPill.textContent = originalText;
          }, 1500);
        }
      } catch (err) {
        prompt('このURLをコピーして盤面を共有してください:', shareUrl);
      }
    });
  }

  /**
   * ブラウザURLのクエリパラメータを更新する
   * @param {string} salt
   */
  updateUrlParam(salt) {
    const url = new URL(window.location.href);
    url.searchParams.set('salt', salt);
    window.history.replaceState({}, '', url.toString());
  }
}

