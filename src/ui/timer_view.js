// @ts-check
import { GameTimer } from '../core/timer.js';
import { GameEngine } from '../core/game_engine.js';
import { generateRandomSalt } from '../core/prng.js';
import { DifficultyTitles, calculateTargets } from '../core/difficulty.js';

/**
 * タイマーおよびコントロールパネルのUIビュー
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
   * UIの描画
   */
  render() {
    const state = this.engine.getState();
    const currentHeight = state.heightLimit;
    const currentDiff = state.difficultyLevel || 5;
    const targets = calculateTargets(currentHeight, currentDiff);

    const heightOptions = Array.from({ length: 13 }, (_, i) => i + 3) // 3〜15
      .map((h) => `<option value="${h}" ${h === currentHeight ? 'selected' : ''}>${h}段</option>`)
      .join('');

    this.element.innerHTML = `
      <div class="stats-panel">
        <div class="stat-card">
          <span class="stat-label">TIME</span>
          <span class="stat-value" id="timer-display">00:00.00</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">MOVES</span>
          <span class="stat-value" id="moves-display">0 手</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">HEIGHT</span>
          <select id="height-select" class="height-select" title="レーンの高さを変更">
            ${heightOptions}
          </select>
        </div>
        <div class="stat-card salt-card">
          <span class="stat-label">SALT (難読化コード)</span>
          <div class="salt-input-group">
            <input type="text" id="salt-input" class="salt-input" maxlength="12" spellcheck="false" value="${this.engine.getCurrentSalt()}" />
            <button id="load-salt-btn" class="btn btn-secondary" title="このソルトの盤面をロード">読込</button>
            <button id="copy-salt-btn" class="btn btn-secondary" title="共有URLをコピー">コピー</button>
          </div>
        </div>
      </div>
      
      <!-- 難易度スライダー & 目標情報パネル -->
      <div class="difficulty-panel">
        <div class="difficulty-header">
          <span class="diff-title-label">
            DIFFICULTY: <strong id="diff-level-text">Lv ${currentDiff}</strong>
            <span class="diff-title-desc" id="diff-title-desc">${DifficultyTitles[currentDiff]}</span>
          </span>
          <span class="diff-target-badge" id="diff-target-badge">
            🎯 目標: <strong id="target-moves-text">${targets.targetMoves}手</strong> / <strong id="target-time-text">${GameTimer.formatTime(targets.targetTimeMs)}</strong>
            <small>(${targets.secPerMove}s/手)</small>
          </span>
        </div>
        <div class="slider-wrapper">
          <span class="slider-end-label">Lv1 初心</span>
          <input type="range" id="difficulty-slider" class="difficulty-slider" min="1" max="10" step="1" value="${currentDiff}" title="難易度を変更 (1〜10)" />
          <span class="slider-end-label">Lv10 神話</span>
        </div>
      </div>

      <div class="actions-panel">
        <button id="new-game-btn" class="btn btn-primary">🎲 新規ゲーム (新ソルト)</button>
        <button id="reset-game-btn" class="btn btn-outline">🔄 リトライ (初期状態)</button>
      </div>
    `;

    this.timerDisplay = this.element.querySelector('#timer-display');
    this.movesDisplay = this.element.querySelector('#moves-display');
    this.heightSelect = /** @type {HTMLSelectElement} */ (this.element.querySelector('#height-select'));
    this.saltInput = /** @type {HTMLInputElement} */ (this.element.querySelector('#salt-input'));
    this.difficultySlider = /** @type {HTMLInputElement} */ (this.element.querySelector('#difficulty-slider'));
    this.diffLevelText = this.element.querySelector('#diff-level-text');
    this.diffTitleDesc = this.element.querySelector('#diff-title-desc');
    this.targetMovesText = this.element.querySelector('#target-moves-text');
    this.targetTimeText = this.element.querySelector('#target-time-text');
    this.diffTargetBadge = this.element.querySelector('#diff-target-badge');
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
      if (this.saltInput && this.saltInput !== document.activeElement) {
        this.saltInput.value = state.salt;
      }
      if (this.heightSelect && Number(this.heightSelect.value) !== state.heightLimit) {
        this.heightSelect.value = String(state.heightLimit);
      }
      if (this.difficultySlider && Number(this.difficultySlider.value) !== state.difficultyLevel) {
        this.difficultySlider.value = String(state.difficultyLevel);
      }
      if (state.timerStatus === 'idle' && this.timerDisplay) {
        this.timerDisplay.textContent = GameTimer.formatTime(state.elapsedTime);
      }

      // 目標表示の更新
      const currentDiff = state.difficultyLevel || 5;
      const targets = calculateTargets(state.heightLimit, currentDiff);
      if (this.diffLevelText) this.diffLevelText.textContent = `Lv ${currentDiff}`;
      if (this.diffTitleDesc) this.diffTitleDesc.textContent = DifficultyTitles[currentDiff];
      if (this.targetMovesText) this.targetMovesText.textContent = `${targets.targetMoves}手`;
      if (this.targetTimeText) this.targetTimeText.textContent = GameTimer.formatTime(targets.targetTimeMs);
      if (this.diffTargetBadge) {
        const small = this.diffTargetBadge.querySelector('small');
        if (small) small.textContent = `(${targets.secPerMove}s/手)`;
      }
    });

    // 難易度スライダー変更時
    this.difficultySlider?.addEventListener('input', () => {
      const level = parseInt(this.difficultySlider.value, 10);
      this.engine.setDifficultyLevel(level);
    });

    // 高さセレクト変更時
    this.heightSelect?.addEventListener('change', () => {
      const newHeight = parseInt(this.heightSelect.value, 10);
      this.engine.setHeightLimit(newHeight);
      this.updateUrlParam(this.engine.getCurrentSalt());
    });

    // 新規ゲームボタン (現在の高さで新規ソルト生成)
    const newGameBtn = this.element.querySelector('#new-game-btn');
    newGameBtn?.addEventListener('click', () => {
      const currentHeight = this.engine.getState().heightLimit;
      const newSalt = generateRandomSalt(currentHeight);
      this.engine.loadFromSalt(newSalt);
      this.updateUrlParam(newSalt);
    });

    // リセットボタン
    const resetGameBtn = this.element.querySelector('#reset-game-btn');
    resetGameBtn?.addEventListener('click', () => {
      this.engine.reset();
    });

    // ソルトロードボタン
    const loadSaltBtn = this.element.querySelector('#load-salt-btn');
    loadSaltBtn?.addEventListener('click', () => {
      const inputVal = this.saltInput?.value.trim();
      if (inputVal) {
        this.engine.loadFromSalt(inputVal);
        this.updateUrlParam(this.engine.getCurrentSalt());
      }
    });

    // Enterキーでもソルトをロード
    this.saltInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const inputVal = this.saltInput.value.trim();
        if (inputVal) {
          this.engine.loadFromSalt(inputVal);
          this.updateUrlParam(this.engine.getCurrentSalt());
          this.saltInput.blur();
        }
      }
    });

    // ソルトコピーボタン
    const copySaltBtn = this.element.querySelector('#copy-salt-btn');
    copySaltBtn?.addEventListener('click', async () => {
      const currentSalt = this.engine.getCurrentSalt();
      const shareUrl = `${window.location.origin}${window.location.pathname}?salt=${encodeURIComponent(currentSalt)}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        if (copySaltBtn) {
          const originalText = copySaltBtn.textContent;
          copySaltBtn.textContent = 'コピー完了!';
          setTimeout(() => {
            copySaltBtn.textContent = originalText;
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
