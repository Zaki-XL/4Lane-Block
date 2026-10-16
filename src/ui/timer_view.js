// @ts-check
import { GameTimer } from '../core/timer.js';
import { GameEngine } from '../core/game_engine.js';
import { generateRandomSalt } from '../core/prng.js';

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
        <div class="stat-card salt-card">
          <span class="stat-label">SALT (盤面コード)</span>
          <div class="salt-input-group">
            <input type="text" id="salt-input" class="salt-input" maxlength="12" spellcheck="false" value="${this.engine.getCurrentSalt()}" />
            <button id="load-salt-btn" class="btn btn-secondary" title="このソルトの盤面をロード">読込</button>
            <button id="copy-salt-btn" class="btn btn-secondary" title="ソルトをクリップボードにコピー">コピー</button>
          </div>
        </div>
      </div>
      <div class="actions-panel">
        <button id="new-game-btn" class="btn btn-primary">🎲 新規ゲーム (新ソルト)</button>
        <button id="reset-game-btn" class="btn btn-outline">🔄 リトライ (初期状態)</button>
      </div>
    `;

    this.timerDisplay = this.element.querySelector('#timer-display');
    this.movesDisplay = this.element.querySelector('#moves-display');
    this.saltInput = /** @type {HTMLInputElement} */ (this.element.querySelector('#salt-input'));
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
      if (state.timerStatus === 'idle' && this.timerDisplay) {
        this.timerDisplay.textContent = GameTimer.formatTime(state.elapsedTime);
      }
    });

    // 新規ゲームボタン
    const newGameBtn = this.element.querySelector('#new-game-btn');
    newGameBtn?.addEventListener('click', () => {
      const newSalt = generateRandomSalt();
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
        this.updateUrlParam(inputVal);
      }
    });

    // Enterキーでもソルトをロード
    this.saltInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const inputVal = this.saltInput.value.trim();
        if (inputVal) {
          this.engine.loadFromSalt(inputVal);
          this.updateUrlParam(inputVal);
          this.saltInput.blur();
        }
      }
    });

    // ソルトコピーボタン
    const copySaltBtn = this.element.querySelector('#copy-salt-btn');
    copySaltBtn?.addEventListener('click', async () => {
      const currentSalt = this.engine.getCurrentSalt();
      try {
        const shareUrl = `${window.location.origin}${window.location.pathname}?salt=${encodeURIComponent(currentSalt)}`;
        await navigator.clipboard.writeText(shareUrl);
        if (copySaltBtn) {
          const originalText = copySaltBtn.textContent;
          copySaltBtn.textContent = 'コピー完了!';
          setTimeout(() => {
            copySaltBtn.textContent = originalText;
          }, 1500);
        }
      } catch (err) {
        // クリップボードAPI失敗時のフォールバック
        prompt('このURLをコピーして盤面を共有してください:', window.location.href);
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
