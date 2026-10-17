// @ts-check
import { GameTimer } from '../core/timer.js';
import { GameEngine } from '../core/game_engine.js';
import { generateRandomSalt } from '../core/prng.js';
import { evaluateResult, DifficultyTitles } from '../core/difficulty.js';

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
          <div class="modal-rank-badge" id="modal-rank-badge">RANK S</div>
          <div class="modal-stars" id="modal-stars">★★★</div>
          <h2 class="modal-title" id="modal-eval-title">EXCELLENT!</h2>
          <p class="modal-subtitle" id="modal-eval-subtitle">難易度目標をクリアしました！</p>
          
          <div class="result-grid">
            <div class="result-item">
              <span class="result-label">クリアタイム</span>
              <span class="result-value" id="result-time">--:--.--</span>
              <span class="result-target" id="result-target-time">目標: --:--</span>
            </div>
            <div class="result-item">
              <span class="result-label">総手数</span>
              <span class="result-value" id="result-moves">-- 手</span>
              <span class="result-target" id="result-target-moves">目標: -- 手</span>
            </div>
          </div>

          <div class="result-diff-info" id="result-diff-info">
            難易度: <strong id="result-diff-title">Lv 5 標準</strong>
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
    this.rankBadgeEl = this.container.querySelector('#modal-rank-badge');
    this.starsEl = this.container.querySelector('#modal-stars');
    this.evalTitleEl = this.container.querySelector('#modal-eval-title');
    this.evalSubtitleEl = this.container.querySelector('#modal-eval-subtitle');
    this.timeEl = this.container.querySelector('#result-time');
    this.targetTimeEl = this.container.querySelector('#result-target-time');
    this.movesEl = this.container.querySelector('#result-moves');
    this.targetMovesEl = this.container.querySelector('#result-target-moves');
    this.diffTitleEl = this.container.querySelector('#result-diff-title');
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
      const currentHeight = this.engine.getState().heightLimit;
      const newSalt = generateRandomSalt(currentHeight);
      this.engine.loadFromSalt(newSalt);
      const url = new URL(window.location.href);
      url.searchParams.set('salt', newSalt);
      window.history.replaceState({}, '', url.toString());
    });
  }

  /**
   * モーダルを表示する
   * @param {any} result
   */
  show(result) {
    const height = result.heightLimit || this.engine.getState().heightLimit;
    const diffLevel = result.difficultyLevel || this.engine.getState().difficultyLevel || 5;

    const evaluation = evaluateResult(result.moveCount, result.elapsedTime, height, diffLevel);

    // ランクバッジと星
    if (this.rankBadgeEl) {
      this.rankBadgeEl.textContent = `RANK ${evaluation.rank}`;
      this.rankBadgeEl.className = `modal-rank-badge rank-${evaluation.rank.toLowerCase()}`;
    }

    if (this.starsEl) {
      const fullStars = '★'.repeat(evaluation.stars);
      const emptyStars = '☆'.repeat(3 - evaluation.stars);
      this.starsEl.textContent = fullStars + emptyStars;
    }

    if (this.evalTitleEl) this.evalTitleEl.textContent = evaluation.title;

    let subMsg = '見事にすべてのブロックを整列させました！';
    if (evaluation.rank === 'S') {
      subMsg = '🏆 手数・タイムともに目標達成！ 完璧なクリアです！';
    } else if (evaluation.isMovesAchieved) {
      subMsg = '🎯 目標手数を達成！ 素晴らしい思考スピードです！';
    } else if (evaluation.isTimeAchieved) {
      subMsg = '⚡ 目標タイムを達成！ 驚異的な早技です！';
    }
    if (this.evalSubtitleEl) this.evalSubtitleEl.textContent = subMsg;

    // 実績値
    if (this.timeEl) this.timeEl.textContent = GameTimer.formatTime(result.elapsedTime);
    if (this.movesEl) this.movesEl.textContent = `${result.moveCount} 手`;
    if (this.saltEl) this.saltEl.textContent = result.salt;

    // 目標値
    if (this.targetTimeEl) {
      this.targetTimeEl.textContent = `目標: ${GameTimer.formatTime(evaluation.targetTimeMs)}`;
      this.targetTimeEl.className = `result-target ${evaluation.isTimeAchieved ? 'target-pass' : 'target-fail'}`;
    }
    if (this.targetMovesEl) {
      this.targetMovesEl.textContent = `目標: ${evaluation.targetMoves} 手`;
      this.targetMovesEl.className = `result-target ${evaluation.isMovesAchieved ? 'target-pass' : 'target-fail'}`;
    }
    if (this.diffTitleEl) {
      this.diffTitleEl.textContent = `Lv ${diffLevel} ${DifficultyTitles[diffLevel] || ''}`;
    }

    this.modalEl?.classList.remove('hidden');
  }

  /**
   * モーダルを非表示にする
   */
  hide() {
    this.modalEl?.classList.add('hidden');
  }
}
