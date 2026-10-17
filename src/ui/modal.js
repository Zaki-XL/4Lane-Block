// @ts-check
import { GameTimer } from '../core/timer.js';
import { GameEngine } from '../core/game_engine.js';
import { generateRandomSalt } from '../core/prng.js';
import { evaluateResult, DifficultyTitles } from '../core/difficulty.js';
import { checkAndSaveHighScore, getHighScore } from '../core/storage.js';

/**
 * 自前軽量 Canvas 紙吹雪 (Confetti) エンジン (高速テンポ調整版)
 */
class ConfettiCannon {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'confetti-canvas';
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.animId = null;
    this.colors = ['#38bdf8', '#fbbf24', '#f43f5e', '#34d399', '#a855f7', '#fb923c', '#ffffff'];

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * 紙吹雪を発射する (高速落下・短時間フェード)
   * @param {number} count
   * @param {boolean} isRankS
   */
  fire(count = 85, isRankS = false) {
    this.resize();
    if (!this.canvas.parentElement) {
      document.body.appendChild(this.canvas);
    }

    const goldColors = ['#fbbf24', '#f59e0b', '#fef08a', '#ffffff', '#38bdf8'];
    const activeColors = isRankS ? goldColors : this.colors;

    this.particles = [];
    for (let i = 0; i < (isRankS ? count * 1.4 : count); i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: -20 - Math.random() * 80,
        w: 6 + Math.random() * 8,
        h: 4 + Math.random() * 6,
        color: activeColors[Math.floor(Math.random() * activeColors.length)],
        vx: (Math.random() - 0.5) * 5,
        vy: 6 + Math.random() * 8, // 高速落下 (旧 2〜6 -> 6〜14)
        rotation: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 12,
        opacity: 1,
        oscSpeed: 0.08 + Math.random() * 0.06,
        oscStep: Math.random() * Math.PI * 2,
      });
    }

    if (!this.animId) {
      this.loop();
    }
  }

  loop() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    let activeCount = 0;
    for (const p of this.particles) {
      p.x += p.vx + Math.sin(p.oscStep) * 1.5;
      p.y += p.vy;
      p.oscStep += p.oscSpeed;
      p.rotation += p.vRot;

      if (p.y > this.canvas.height - 120) {
        p.opacity -= 0.045; // より早くサッと消える
      }

      if (p.opacity > 0 && p.y < this.canvas.height + 20) {
        activeCount++;
        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate((p.rotation * Math.PI) / 180);
        this.ctx.globalAlpha = Math.max(0, p.opacity);
        this.ctx.fillStyle = p.color;
        this.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        this.ctx.restore();
      }
    }

    if (activeCount > 0) {
      this.animId = requestAnimationFrame(() => this.loop());
    } else {
      this.stop();
    }
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }
}

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
    this.confetti = new ConfettiCannon();

    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div id="clear-modal" class="modal-backdrop hidden">
        <div class="modal-card">
          <div class="modal-rank-badge" id="modal-rank-badge">RANK S</div>
          <div class="modal-stars-container" id="modal-stars-container">
            <span class="star-item" id="star-1">★</span>
            <span class="star-item" id="star-2">★</span>
            <span class="star-item" id="star-3">★</span>
          </div>
          <h2 class="modal-title" id="modal-eval-title">EXCELLENT!</h2>
          <p class="modal-subtitle" id="modal-eval-subtitle">難易度目標をクリアしました！</p>
          
          <!-- スコアカード (大型デジタル表示 & NEW RECORD) -->
          <div class="result-score-card">
            <span class="score-label">TOTAL SCORE</span>
            <div class="score-number-row">
              <span class="score-value" id="result-score">0</span>
              <span class="new-record-badge hidden" id="result-new-record">🏆 NEW RECORD!</span>
            </div>
            <div class="score-breakdown-row" id="result-score-breakdown">
              <span>倍率: x1.0</span> | <span>ボーナス: 0</span>
            </div>
          </div>

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
    this.starsContainerEl = this.container.querySelector('#modal-stars-container');
    this.star1 = this.container.querySelector('#star-1');
    this.star2 = this.container.querySelector('#star-2');
    this.star3 = this.container.querySelector('#star-3');
    this.evalTitleEl = this.container.querySelector('#modal-eval-title');
    this.evalSubtitleEl = this.container.querySelector('#modal-eval-subtitle');
    this.scoreEl = this.container.querySelector('#result-score');
    this.newRecordBadgeEl = this.container.querySelector('#result-new-record');
    this.scoreBreakdownEl = this.container.querySelector('#result-score-breakdown');
    this.timeEl = this.container.querySelector('#result-time');
    this.targetTimeEl = this.container.querySelector('#result-target-time');
    this.movesEl = this.container.querySelector('#result-moves');
    this.targetMovesEl = this.container.querySelector('#result-target-moves');
    this.diffTitleEl = this.container.querySelector('#result-diff-title');
    this.saltEl = this.container.querySelector('#result-salt');
  }

  bindEvents() {
    this.engine.on('gameClear', (result) => {
      // 3レーンの勝利ウェーブをしっかり鑑賞できるウエイト (約1.3秒)
      setTimeout(() => {
        this.show(result);
      }, 1300);
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

    // ハイスコア判定と Cookie 永続化
    const saveRes = checkAndSaveHighScore(diffLevel, evaluation.score, result.moveCount, result.elapsedTime);

    // 紙吹雪発射！ (高速版)
    this.confetti.fire(85, evaluation.rank === 'S');

    // ランクバッジ
    if (this.rankBadgeEl) {
      this.rankBadgeEl.textContent = `RANK ${evaluation.rank}`;
      this.rankBadgeEl.className = `modal-rank-badge rank-${evaluation.rank.toLowerCase()} rank-bounce`;
    }

    // スコアの表示 (カウントアップ演出)
    if (this.scoreEl) {
      const targetScore = evaluation.score;
      let currentVal = 0;
      const step = Math.max(1, Math.floor(targetScore / 25));
      const counterTimer = setInterval(() => {
        currentVal = Math.min(targetScore, currentVal + step);
        if (this.scoreEl) this.scoreEl.textContent = currentVal.toLocaleString();
        if (currentVal >= targetScore) {
          clearInterval(counterTimer);
        }
      }, 20);
    }

    // NEW RECORD バッジ
    if (this.newRecordBadgeEl) {
      if (saveRes.isNewRecord && saveRes.previousBest > 0) {
        this.newRecordBadgeEl.classList.remove('hidden');
        this.newRecordBadgeEl.textContent = '🏆 NEW RECORD!';
      } else if (saveRes.isNewRecord) {
        this.newRecordBadgeEl.classList.remove('hidden');
        this.newRecordBadgeEl.textContent = '✨ 初クリア記録!';
      } else {
        this.newRecordBadgeEl.classList.add('hidden');
      }
    }

    // スコア内訳
    if (this.scoreBreakdownEl && evaluation.scoreBreakdown) {
      const b = evaluation.scoreBreakdown;
      this.scoreBreakdownEl.innerHTML = `
        <span>難易度倍率: <strong>x${b.diffMultiplier}</strong></span>
        <span>効率: <strong>${(b.efficiency * 100).toFixed(0)}%</strong></span>
        <span>ボーナス: <strong>+${b.rankBonus.toLocaleString()}</strong></span>
      `;
    }

    // 星の順次ポップイン演出
    const starEls = [this.star1, this.star2, this.star3];
    starEls.forEach((starEl, idx) => {
      if (!starEl) return;
      starEl.className = 'star-item';
      starEl.textContent = idx < evaluation.stars ? '★' : '☆';
      if (idx < evaluation.stars) {
        starEl.classList.add('star-filled');
        // 時間差でポンと登場
        setTimeout(() => {
          starEl.classList.add('star-pop');
        }, (idx + 1) * 220);
      } else {
        starEl.classList.add('star-empty');
      }
    });

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
    this.confetti.stop();
    this.modalEl?.classList.add('hidden');
  }
}

