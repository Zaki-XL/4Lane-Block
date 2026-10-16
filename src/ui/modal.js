// @ts-check
import { GameTimer } from '../core/timer.js';
import { GameEngine } from '../core/game_engine.js';
import { generateRandomSalt } from '../core/prng.js';

/**
 * ゲームクリア・リザルトモーダル
 */
export class GameClearModal {
  /**
   * @param {GameEngine} engine
   * @param {HTMLElement} containerElement
   */
  constructor(engine, containerElement) {
    this.engine = engine;
    this.container = containerElement;

    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div id="clear-modal" class="modal-backdrop hidden">
        <div class="modal-card">
          <div class="modal-badge">🎉 STAGE CLEAR!</div>
          <h2 class="modal-title">ゲームクリア！</h2>
          <p class="modal-subtitle">見事にすべてのブロックを色ごとに整列させました！</p>
          
          <div class="result-grid">
            <div class="result-item">
              <span class="result-label">クリアタイム</span>
              <span class="result-value" id="result-time">--:--.--</span>
            </div>
            <div class="result-item">
              <span class="result-label">総手数</span>
              <span class="result-value" id="result-moves">-- 手</span>
            </div>
          </div>

          <div class="result-salt-box">
            <span class="result-salt-label">盤面ソルト:</span>
            <code class="result-salt-code" id="result-salt">------</code>
            <button id="modal-copy-btn" class="btn btn-sm btn-secondary">共有URLをコピー</button>
          </div>

          <div class="modal-actions">
            <button id="modal-retry-btn" class="btn btn-outline">🔄 同じ盤面をリトライ</button>
            <button id="modal-next-btn" class="btn btn-primary">✨ 次のランダム盤面へ</button>
          </div>
        </div>
      </div>
    `;

    this.modalEl = this.container.querySelector('#clear-modal');
    this.timeEl = this.container.querySelector('#result-time');
    this.movesEl = this.container.querySelector('#result-moves');
    this.saltEl = this.container.querySelector('#result-salt');
  }

  bindEvents() {
    this.engine.on('gameClear', (result) => {
      this.show(result);
    });

    const copyBtn = this.container.querySelector('#modal-copy-btn');
    copyBtn?.addEventListener('click', async () => {
      const salt = this.engine.getCurrentSalt();
      const shareUrl = `${window.location.origin}${window.location.pathname}?salt=${encodeURIComponent(salt)}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        if (copyBtn) {
          const originalText = copyBtn.textContent;
          copyBtn.textContent = 'コピーしました!';
          setTimeout(() => {
            copyBtn.textContent = originalText;
          }, 1500);
        }
      } catch (err) {
        prompt('このURLを共有してください:', shareUrl);
      }
    });

    const retryBtn = this.container.querySelector('#modal-retry-btn');
    retryBtn?.addEventListener('click', () => {
      this.hide();
      this.engine.reset();
    });

    const nextBtn = this.container.querySelector('#modal-next-btn');
    nextBtn?.addEventListener('click', () => {
      this.hide();
      const newSalt = generateRandomSalt();
      this.engine.loadFromSalt(newSalt);
      const url = new URL(window.location.href);
      url.searchParams.set('salt', newSalt);
      window.history.replaceState({}, '', url.toString());
    });
  }

  /**
   * モーダルを表示する
   * @param {import('../core/types.js').GameClearResult} result
   */
  show(result) {
    if (this.timeEl) this.timeEl.textContent = GameTimer.formatTime(result.elapsedTime);
    if (this.movesEl) this.movesEl.textContent = `${result.moveCount} 手`;
    if (this.saltEl) this.saltEl.textContent = result.salt;
    this.modalEl?.classList.remove('hidden');
  }

  /**
   * モーダルを非表示にする
   */
  hide() {
    this.modalEl?.classList.add('hidden');
  }
}
