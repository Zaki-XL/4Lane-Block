// @ts-check
import { GameTimer } from '../core/timer.js';
import { GameEngine } from '../core/game_engine.js';
import { t, i18n } from '../i18n/index.js';

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

    // 言語変更時にHUDを更新
    i18n.onLanguageChange(() => {
      this.updateTexts();
    });
  }

  /**
   * UIの描画 (プレイ用のすっきりしたHUD)
   */
  render() {
    const state = this.engine.getState();
    const currentHeight = state.heightLimit;
    const currentDiff = state.difficultyLevel || 5;

    this.element.innerHTML = `
      <div class="hud-container">
        <!-- 左側：メイン統計 (TIME & MOVES: 固定幅・等幅数字) -->
        <div class="hud-primary-stats">
          <div class="stat-card stat-time-card">
            <span class="stat-label" id="label-time">${t('hud.time')}</span>
            <span class="stat-value time-value" id="timer-display">00:00.00</span>
          </div>
          <div class="stat-card stat-moves-card">
            <span class="stat-label" id="label-moves">${t('hud.moves')}</span>
            <span class="stat-value moves-value" id="moves-display">0</span>
          </div>
        </div>

        <!-- 中央：設定バッジ情報 -->
        <div class="hud-secondary-stats">
          <div class="config-summary-badges">
            <span class="config-pill" id="hud-height-pill">${t('hud.tiers', { n: currentHeight })}</span>
            <span class="config-pill" id="hud-diff-pill">Lv${currentDiff}</span>
            <span class="config-pill salt-pill" id="hud-salt-pill" title="${t('hud.copySaltTitle')}">${state.salt || '------'}</span>
          </div>
        </div>

        <!-- 右側：アクションボタン (リセット & スコア一覧) -->
        <div class="hud-actions">
          <button id="reset-game-btn" class="btn btn-reset" title="${t('hud.resetTitle')}">
            ${t('hud.resetBtn')}
          </button>
          <button id="open-score-btn" class="btn btn-secondary btn-score" title="${t('hud.scoreTitle')}">
            ${t('hud.scoreBtn')}
          </button>
        </div>
      </div>
    `;

    this.timerDisplay = this.element.querySelector('#timer-display');
    this.movesDisplay = this.element.querySelector('#moves-display');
    this.hudHeightPill = this.element.querySelector('#hud-height-pill');
    this.hudDiffPill = this.element.querySelector('#hud-diff-pill');
    this.hudSaltPill = this.element.querySelector('#hud-salt-pill');
    this.resetBtn = this.element.querySelector('#reset-game-btn');
    this.scoreBtn = this.element.querySelector('#open-score-btn');
    this.labelTime = this.element.querySelector('#label-time');
    this.labelMoves = this.element.querySelector('#label-moves');
  }

  /**
   * 言語切り替え時のテキスト一括更新
   */
  updateTexts() {
    const state = this.engine.getState();
    if (this.labelTime) this.labelTime.textContent = t('hud.time');
    if (this.labelMoves) this.labelMoves.textContent = t('hud.moves');
    if (this.hudHeightPill) this.hudHeightPill.textContent = t('hud.tiers', { n: state.heightLimit });
    if (this.hudSaltPill) this.hudSaltPill.setAttribute('title', t('hud.copySaltTitle'));
    if (this.resetBtn) {
      this.resetBtn.textContent = t('hud.resetBtn');
      this.resetBtn.setAttribute('title', t('hud.resetTitle'));
    }
    if (this.scoreBtn) {
      this.scoreBtn.textContent = t('hud.scoreBtn');
      this.scoreBtn.setAttribute('title', t('hud.scoreTitle'));
    }
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
        this.movesDisplay.textContent = `${state.moveCount}`;
      }
      if (this.timerDisplay) {
        this.timerDisplay.textContent = GameTimer.formatTime(state.elapsedTime);
      }

      // バッジ表示の更新
      const currentDiff = state.difficultyLevel || 5;
      if (this.hudHeightPill) this.hudHeightPill.textContent = t('hud.tiers', { n: state.heightLimit });
      if (this.hudDiffPill) {
        this.hudDiffPill.textContent = `Lv${currentDiff}`;
      }
      if (this.hudSaltPill) {
        this.hudSaltPill.textContent = state.salt || '------';
      }
    });

    // 🔄 リセットボタン (設定・リセットモーダルを開く)
    const resetGameBtn = this.element.querySelector('#reset-game-btn');
    resetGameBtn?.addEventListener('click', () => {
      this.engine.emit('requestOpenSettings');
    });

    // 🏆 スコアボタン (スコア一覧モーダルを開く)
    const openScoreBtn = this.element.querySelector('#open-score-btn');
    openScoreBtn?.addEventListener('click', () => {
      this.engine.emit('requestOpenScoreList');
    });

    // ソルトバッジクリックで共有URLをコピー
    this.hudSaltPill?.addEventListener('click', async () => {
      const currentSalt = this.engine.getCurrentSalt();
      const shareUrl = `${window.location.origin}${window.location.pathname}?salt=${encodeURIComponent(currentSalt)}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        const originalText = this.hudSaltPill?.textContent;
        if (this.hudSaltPill) {
          this.hudSaltPill.textContent = t('hud.copied');
          setTimeout(() => {
            if (this.hudSaltPill) this.hudSaltPill.textContent = originalText;
          }, 1500);
        }
      } catch (err) {
        prompt(t('hud.copyPrompt'), shareUrl);
      }
    });
  }
}

