// @ts-check
import { GameTimer } from '../core/timer.js';
import { GameEngine } from '../core/game_engine.js';
import { evaluateResult } from '../core/difficulty.js';
import { checkAndSaveHighScore, getAllHighScoreList, getRTARecord, resetAllRTARecords } from '../core/storage.js';
import { t, i18n } from '../i18n/index.js';
import { generateResultCardBlob, generateRTAResultCardBlob, executeShare } from './result_card_canvas.js';

/**
 * 画面下部にフワッと表示するトースト通知
 * @param {string} message
 */
export function showToast(message) {
  let toastEl = document.getElementById('share-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'share-toast';
    toastEl.className = 'share-toast hidden';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.remove('hidden', 'fade-out');
  toastEl.classList.add('visible');

  // @ts-ignore
  if (toastEl._timer) {
    // @ts-ignore
    clearTimeout(toastEl._timer);
  }
  // @ts-ignore
  toastEl._timer = setTimeout(() => {
    if (!toastEl) return;
    toastEl.classList.remove('visible');
    toastEl.classList.add('fade-out');
    setTimeout(() => {
      toastEl?.classList.add('hidden');
    }, 300);
  }, 2800);
}

/**
 * 自前軽量 Canvas 紙吹雪 (Confetti) エンジン (メモリ解放・リサイズライフサイクル管理版)
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
      window.addEventListener('resize', this.resize);
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
    window.removeEventListener('resize', this.resize);
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
    /** @type {any} */
    this.lastResult = null;
    /** @type {any} */
    this.lastEvaluation = null;
    /** @type {any} */
    this.lastSaveRes = null;
    /** @type {Blob | null} */
    this.preRenderedBlob = null;
    /** @type {Promise<Blob | null> | null} */
    this.renderPromise = null;
    /** @type {boolean} */
    this.isSharing = false;
    /** @type {((action: string, payload?: any) => void) | null} */
    this.onAction = null;

    this.render();
    this.bindEvents();

    // 言語切り替え時にリザルト画面の全テキストを即時更新し、画像も再プリレンダリング
    i18n.onLanguageChange(() => {
      this.updateTexts();
      if (this.modalEl && !this.modalEl.classList.contains('hidden') && this.lastResult) {
        this.startPreRender();
      }
    });
  }

  /**
   * リザルトカード画像を先行生成してメモリにキャッシュ (User Gesture 維持 & 待機ゼロ化)
   */
  startPreRender() {
    if (!this.lastResult || !this.lastEvaluation) return;
    this.preRenderedBlob = null;
    const height = this.lastResult.heightLimit || this.engine.getState().heightLimit;
    const diffLevel = this.lastResult.difficultyLevel || this.engine.getState().difficultyLevel || 5;
    const salt = this.lastResult.salt || this.engine.getCurrentSalt();
    const shareUrl = `${window.location.origin}${window.location.pathname}?salt=${encodeURIComponent(salt)}`;

    this.renderPromise = generateResultCardBlob({
      result: this.lastResult,
      evalResult: this.lastEvaluation,
      lanes: this.engine.getState().lanes,
      difficultyLevel: diffLevel,
      heightLimit: height,
      isNewRecord: Boolean(this.lastSaveRes?.isNewRecord),
      shareUrl
    }).then((blob) => {
      this.preRenderedBlob = blob;
      return blob;
    }).catch((err) => {
      console.warn('[PreRender] Failed to generate card blob:', err);
      return null;
    });
  }

  /**
   * Controller へアクションを通知
   * @param {string} action
   * @param {any} [payload]
   */
  dispatchAction(action, payload) {
    if (typeof this.onAction === 'function') {
      this.onAction(action, payload);
    }
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
          <p class="modal-subtitle" id="modal-eval-subtitle"></p>
          
          <!-- スコアカード (大型デジタル表示 & NEW RECORD & ハイスコア) -->
          <div class="result-score-card">
            <span class="score-label" id="result-score-label">${t('result.totalScore')}</span>
            <div class="score-number-row">
              <span class="score-value" id="result-score">0</span>
              <span class="new-record-badge hidden" id="result-new-record">${t('result.newRecord')}</span>
            </div>
            <div class="result-best-row">
              <span class="result-best-badge" id="result-best-badge">
                <span id="result-best-label">${t('result.highScore')}</span>
                <strong id="result-highscore">0</strong>
                <span id="result-best-pts">${t('result.pts')}</span>
              </span>
            </div>
            <div class="score-breakdown-row" id="result-score-breakdown">
              <span>${t('result.diffMultiplier')} x1.0</span> | <span>${t('result.bonus')} 0</span>
            </div>
          </div>

          <div class="result-grid">
            <div class="result-item">
              <span class="result-label" id="result-label-time">${t('result.clearTime')}</span>
              <span class="result-value" id="result-time">--:--.--</span>
            </div>
            <div class="result-item">
              <span class="result-label" id="result-label-moves">${t('result.totalMoves')}</span>
              <span class="result-value" id="result-moves">--</span>
            </div>
          </div>

          <div class="result-diff-info" id="result-diff-info">
            <span id="result-diff-label">${t('result.difficulty')}</span> <strong id="result-diff-title">Lv 5</strong>
          </div>

          <div class="result-salt-box">
            <span class="result-salt-label" id="result-salt-label">${t('result.saltLabel')}</span>
            <code class="result-salt-code" id="result-salt">------</code>
            <button id="modal-copy-btn" class="btn btn-sm btn-secondary">${t('result.copyBtn')}</button>
          </div>

          <div class="modal-actions modal-actions-share">
            <button id="modal-share-btn" class="btn btn-share btn-block">
              <span class="btn-share-icon">📸</span>
              <span id="modal-share-label">${t('result.shareBtn')}</span>
            </button>
          </div>

          <div class="modal-actions">
            <button id="modal-retry-btn" class="btn btn-outline">${t('result.retryBtn')}</button>
            <button id="modal-next-btn" class="btn btn-primary">${t('result.nextBtn')}</button>
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
    this.highScoreEl = this.container.querySelector('#result-highscore');
    this.newRecordBadgeEl = this.container.querySelector('#result-new-record');
    this.scoreBreakdownEl = this.container.querySelector('#result-score-breakdown');
    this.timeEl = this.container.querySelector('#result-time');
    this.movesEl = this.container.querySelector('#result-moves');
    this.diffTitleEl = this.container.querySelector('#result-diff-title');
    this.saltEl = this.container.querySelector('#result-salt');
    this.shareBtn = this.container.querySelector('#modal-share-btn');
    this.shareLabel = this.container.querySelector('#modal-share-label');

    this.updateTexts();
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
          copyBtn.textContent = t('result.copiedBtn');
          setTimeout(() => {
            if (copyBtn) copyBtn.textContent = originalText;
          }, 1500);
        }
      } catch (err) {
        prompt(t('hud.copyPrompt'), shareUrl);
      }
    });

    const retryBtn = this.container.querySelector('#modal-retry-btn');
    retryBtn?.addEventListener('click', () => {
      this.hide();
      this.dispatchAction('retry');
    });

    const nextBtn = this.container.querySelector('#modal-next-btn');
    nextBtn?.addEventListener('click', () => {
      this.hide();
      this.dispatchAction('next');
    });

    this.shareBtn?.addEventListener('click', async () => {
      if (!this.lastResult || !this.lastEvaluation || !this.shareBtn || !this.shareLabel) return;
      if (this.isSharing) return; // 連打抑制: 共有処理中の重複実行を防止

      this.isSharing = true;
      this.shareBtn.setAttribute('disabled', 'true');
      this.shareBtn.classList.add('btn-disabled');

      try {
        // 1. プリレンダリング済みのBlobを取得 (まだ完了していなければ待機)
        let blob = this.preRenderedBlob;
        if (!blob && this.renderPromise) {
          const originalText = this.shareLabel.textContent;
          this.shareLabel.textContent = t('result.sharing');
          blob = await this.renderPromise;
          if (this.shareLabel) this.shareLabel.textContent = originalText;
        }

        if (!blob) {
          // キャッシュがない場合のフォールバック再生成
          this.startPreRender();
          blob = await this.renderPromise;
        }

        if (!blob) throw new Error('Blob generation failed');

        const height = this.lastResult.heightLimit || this.engine.getState().heightLimit;
        const diffLevel = this.lastResult.difficultyLevel || this.engine.getState().difficultyLevel || 5;
        const salt = this.lastResult.salt || this.engine.getCurrentSalt();
        const shareUrl = `${window.location.origin}${window.location.pathname}?salt=${encodeURIComponent(salt)}`;
        const diffTitle = `Lv ${diffLevel}`;
        const tweetText = t('result.shareTweetText', {
          diff: diffTitle,
          rank: `${this.lastEvaluation.rank} ★${this.lastEvaluation.stars}`,
          time: GameTimer.formatTime(this.lastResult.elapsedTime),
          moves: this.lastResult.moveCount,
          score: this.lastEvaluation.score.toLocaleString()
        });

        // 2. 最適共有の実行 (PCでは確実に𝕏のWeb Intentを開く)
        await executeShare({
          blob,
          filename: `4lane-block-clear-${salt}.png`,
          title: `4Lane Block [${diffTitle}] Clear!`,
          text: tweetText,
          url: shareUrl,
          showToast
        });
      } catch (err) {
        console.error('Share execution failed:', err);
      } finally {
        // 共有ダイアログを閉じた後も1.2秒のクールダウンを設けて連打を抑制
        setTimeout(() => {
          this.isSharing = false;
          this.shareBtn?.removeAttribute('disabled');
          this.shareBtn?.classList.remove('btn-disabled');
        }, 1200);
      }
    });
  }

  /**
   * 言語切り替え時にモーダル内の全テキストを更新
   */
  updateTexts() {
    if (!this.modalEl) return;

    // 静的ラベル群の更新
    const scoreLabel = this.modalEl.querySelector('#result-score-label');
    if (scoreLabel) scoreLabel.textContent = t('result.totalScore');

    if (this.shareLabel) this.shareLabel.textContent = t('result.shareBtn');

    const bestLabel = this.modalEl.querySelector('#result-best-label');
    if (bestLabel) bestLabel.textContent = t('result.highScore');

    const bestPts = this.modalEl.querySelector('#result-best-pts');
    if (bestPts) bestPts.textContent = t('result.pts');

    const labelTime = this.modalEl.querySelector('#result-label-time');
    if (labelTime) labelTime.textContent = t('result.clearTime');

    const labelMoves = this.modalEl.querySelector('#result-label-moves');
    if (labelMoves) labelMoves.textContent = t('result.totalMoves');

    const diffLabel = this.modalEl.querySelector('#result-diff-label');
    if (diffLabel) diffLabel.textContent = t('result.difficulty');

    const saltLabel = this.modalEl.querySelector('#result-salt-label');
    if (saltLabel) saltLabel.textContent = t('result.saltLabel');

    const copyBtn = this.modalEl.querySelector('#modal-copy-btn');
    if (copyBtn) copyBtn.textContent = t('result.copyBtn');

    const retryBtn = this.modalEl.querySelector('#modal-retry-btn');
    if (retryBtn) retryBtn.textContent = t('result.retryBtn');

    const nextBtn = this.modalEl.querySelector('#modal-next-btn');
    if (nextBtn) nextBtn.textContent = t('result.nextBtn');

    // 直近のリザルトデータが存在する場合、動的テキストも再計算・反映
    if (this.lastResult) {
      const height = this.lastResult.heightLimit || this.engine.getState().heightLimit;
      const diffLevel = this.lastResult.difficultyLevel || this.engine.getState().difficultyLevel || 5;
      const evaluation = evaluateResult(this.lastResult.moveCount, this.lastResult.elapsedTime, height, diffLevel);

      const rankKey = (evaluation.rank || 'c').toLowerCase();
      if (this.evalTitleEl) this.evalTitleEl.textContent = t(`result.evalTitles.${rankKey}`) || evaluation.title;

      let subMsg = t('result.evalSubMsgNormal');
      if (evaluation.rank === 'S') {
        subMsg = t('result.evalSubMsgS');
      } else if (evaluation.stars >= 2) {
        subMsg = t('result.evalSubMsgHigh');
      }
      if (this.evalSubtitleEl) this.evalSubtitleEl.textContent = subMsg;

      if (this.movesEl) this.movesEl.textContent = t('result.movesUnit', { n: this.lastResult.moveCount });
      if (this.diffTitleEl) {
        this.diffTitleEl.textContent = `Lv ${diffLevel} ${t('difficulty.' + diffLevel) || ''}`;
      }

      if (this.scoreBreakdownEl && evaluation.scoreBreakdown) {
        const b = evaluation.scoreBreakdown;
        this.scoreBreakdownEl.innerHTML = `
          <span>${t('result.diffMultiplier')} <strong>x${b.diffMultiplier}</strong></span>
          <span>${t('result.efficiency')} <strong>${(b.efficiency * 100).toFixed(0)}%</strong></span>
          <span>${t('result.bonus')} <strong>+${b.rankBonus.toLocaleString()}</strong></span>
        `;
      }

      if (this.newRecordBadgeEl && !this.newRecordBadgeEl.classList.contains('hidden')) {
        const isFirst = this.newRecordBadgeEl.getAttribute('data-is-first') === 'true';
        this.newRecordBadgeEl.textContent = isFirst ? t('result.firstClear') : t('result.newRecord');
      }
    }
  }

  /**
   * モーダルを表示する
   * @param {any} result
   */
  show(result) {
    this.lastResult = result;
    this.updateTexts();

    const height = result.heightLimit || this.engine.getState().heightLimit;
    const diffLevel = result.difficultyLevel || this.engine.getState().difficultyLevel || 5;

    const evaluation = evaluateResult(result.moveCount, result.elapsedTime, height, diffLevel);

    // ハイスコア判定と Cookie 永続化 (段数×難易度の組み合わせ保存)
    const saveRes = checkAndSaveHighScore(height, diffLevel, evaluation.score, result.moveCount, result.elapsedTime);
    this.lastEvaluation = evaluation;
    this.lastSaveRes = saveRes;
    const bestScore = saveRes.isNewRecord ? evaluation.score : saveRes.previousBest;
    if (this.highScoreEl) {
      this.highScoreEl.textContent = bestScore.toLocaleString();
    }

    // バックグラウンドでリザルトカードのプリレンダリングを先行開始 (User Gesture維持)
    this.startPreRender();

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
        this.newRecordBadgeEl.setAttribute('data-is-first', 'false');
        this.newRecordBadgeEl.textContent = t('result.newRecord');
      } else if (saveRes.isNewRecord) {
        this.newRecordBadgeEl.classList.remove('hidden');
        this.newRecordBadgeEl.setAttribute('data-is-first', 'true');
        this.newRecordBadgeEl.textContent = t('result.firstClear');
      } else {
        this.newRecordBadgeEl.classList.add('hidden');
      }
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

    if (this.timeEl) this.timeEl.textContent = GameTimer.formatTime(result.elapsedTime);
    if (this.saltEl) this.saltEl.textContent = result.salt;

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

/**
 * スコア一覧・スコアリセット用モーダル
 */
export class ScoreListModal {
  /**
   * @param {GameEngine} engine
   * @param {HTMLElement} containerElement
   */
  constructor(engine, containerElement) {
    this.engine = engine;
    this.container = containerElement;
    /** @type {((action: string, payload?: any) => void) | null} */
    this.onAction = null;

    this.render();
    this.bindEvents();

    // 言語切り替え時にテキスト更新 (bindEventsの再帰実行は厳禁)
    i18n.onLanguageChange(() => {
      this.updateTexts();
    });
  }

  /**
   * Controller へアクションを通知
   * @param {string} action
   * @param {any} [payload]
   */
  dispatchAction(action, payload) {
    if (typeof this.onAction === 'function') {
      this.onAction(action, payload);
    }
  }

  render() {
    const modalWrapper = document.createElement('div');
    modalWrapper.id = 'score-list-modal';
    modalWrapper.className = 'modal-backdrop hidden';
    modalWrapper.innerHTML = `
      <div class="modal-card score-list-card">
        <div class="overlay-card-header">
          <span class="shield-icon">🏆</span>
          <div style="flex: 1;">
            <h3 class="score-modal-title">${t('scoreList.title')}</h3>
          </div>
          <button id="score-open-rta-btn" class="btn btn-sm btn-outline-primary" style="margin-right: 8px;">
            ${t('scoreList.openRtaBtn')}
          </button>
          <button id="score-modal-close-btn" class="modal-close-icon-btn" title="${t('scoreList.closeBtn')}">✕</button>
        </div>

        <div class="score-list-body" id="score-list-items">
          <!-- スコア項目一覧が動的挿入される -->
        </div>

        <div class="score-list-footer">
          <button id="score-reset-all-btn" class="btn btn-outline-danger" title="${t('scoreList.resetBtn')}">
            ${t('scoreList.resetBtn')}
          </button>
          <button id="score-modal-ok-btn" class="btn btn-primary">
            ${t('scoreList.closeBtn')}
          </button>
        </div>
      </div>

      <!-- 独自描画のスコアリセット確認ポップアップ (カードサイズに依存しない画面中央オーバーレイ) -->
      <div id="score-reset-confirm-dialog" class="confirm-overlay hidden">
        <div class="confirm-dialog-card">
          <div class="confirm-dialog-icon">⚠️</div>
          <h4 class="confirm-dialog-title">${t('scoreList.confirmTitle')}</h4>
          <p class="confirm-dialog-desc">${t('scoreList.confirmDesc')}<br><span class="confirm-warning">${t('scoreList.confirmWarning')}</span></p>
          <div class="confirm-dialog-actions">
            <button id="confirm-cancel-btn" class="btn btn-secondary">${t('scoreList.cancelBtn')}</button>
            <button id="confirm-execute-btn" class="btn btn-danger">${t('scoreList.deleteBtn')}</button>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(modalWrapper);
    this.modalEl = modalWrapper;
    this.itemsEl = modalWrapper.querySelector('#score-list-items');
    this.confirmDialogEl = modalWrapper.querySelector('#score-reset-confirm-dialog');
  }

  bindEvents() {
    this.engine.on('requestOpenScoreList', () => {
      this.show();
    });

    const closeBtn = this.modalEl?.querySelector('#score-modal-close-btn');
    closeBtn?.addEventListener('click', () => this.hide());

    const openRtaBtn = this.modalEl?.querySelector('#score-open-rta-btn');
    openRtaBtn?.addEventListener('click', () => {
      this.hide();
      this.engine.emit('requestOpenRTAScoreList');
    });

    const okBtn = this.modalEl?.querySelector('#score-modal-ok-btn');
    okBtn?.addEventListener('click', () => this.hide());

    const resetBtn = this.modalEl?.querySelector('#score-reset-all-btn');
    const cancelBtn = this.modalEl?.querySelector('#confirm-cancel-btn');
    const executeBtn = this.modalEl?.querySelector('#confirm-execute-btn');

    // リセットボタン押下で独自確認ポップアップを表示
    resetBtn?.addEventListener('click', () => {
      this.confirmDialogEl?.classList.remove('hidden');
    });

    // キャンセル押下で確認ポップアップを閉じる
    cancelBtn?.addEventListener('click', () => {
      this.confirmDialogEl?.classList.add('hidden');
    });

    // 確定押下で全消去を実行
    executeBtn?.addEventListener('click', () => {
      this.confirmDialogEl?.classList.add('hidden');
      this.dispatchAction('resetAll');
      this.renderItems();
    });

    // モーダル背景クリックで閉じる (確認ダイアログ非表示時のみ)
    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl && this.confirmDialogEl?.classList.contains('hidden')) {
        this.hide();
      }
    });
  }

  /**
   * 言語切り替え時にモーダル内の全テキストを更新
   */
  updateTexts() {
    if (!this.modalEl) return;
    const titleEl = this.modalEl.querySelector('.score-modal-title');
    if (titleEl) titleEl.textContent = t('scoreList.title');

    const openRtaBtn = this.modalEl.querySelector('#score-open-rta-btn');
    if (openRtaBtn) openRtaBtn.textContent = t('scoreList.openRtaBtn');

    const closeBtn = this.modalEl.querySelector('#score-modal-close-btn');
    if (closeBtn) closeBtn.setAttribute('title', t('scoreList.closeBtn'));

    const resetBtn = this.modalEl.querySelector('#score-reset-all-btn');
    if (resetBtn) {
      resetBtn.textContent = t('scoreList.resetBtn');
      resetBtn.setAttribute('title', t('scoreList.resetBtn'));
    }

    const okBtn = this.modalEl.querySelector('#score-modal-ok-btn');
    if (okBtn) okBtn.textContent = t('scoreList.closeBtn');

    const confirmTitle = this.modalEl.querySelector('.confirm-dialog-title');
    if (confirmTitle) confirmTitle.textContent = t('scoreList.confirmTitle');

    const confirmDesc = this.modalEl.querySelector('.confirm-dialog-desc');
    if (confirmDesc) {
      confirmDesc.innerHTML = `${t('scoreList.confirmDesc')}<br><span class="confirm-warning">${t('scoreList.confirmWarning')}</span>`;
    }

    const cancelBtn = this.modalEl.querySelector('#confirm-cancel-btn');
    if (cancelBtn) cancelBtn.textContent = t('scoreList.cancelBtn');

    const executeBtn = this.modalEl.querySelector('#confirm-execute-btn');
    if (executeBtn) executeBtn.textContent = t('scoreList.deleteBtn');

    this.renderItems();
  }

  renderItems() {
    if (!this.itemsEl) return;
    const list = getAllHighScoreList();
    if (list.length === 0) {
      this.itemsEl.innerHTML = `
        <div class="score-empty-message">
          <p>${t('scoreList.emptyTitle')}</p>
          <span>${t('scoreList.emptyDesc')}</span>
        </div>
      `;
      return;
    }

    this.itemsEl.innerHTML = `
      <div class="score-table-wrapper">
        <table class="score-table">
          <thead>
            <tr>
              <th>${t('scoreList.colConfig')}</th>
              <th>${t('scoreList.colScore')}</th>
              <th>${t('scoreList.colMoves')}</th>
              <th>${t('scoreList.colTime')}</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((item) => `
              <tr>
                <td class="score-cell-config"><strong>${t('hud.tiers', { n: item.height })}</strong> Lv${item.level}</td>
                <td class="score-cell-val"><strong>${item.score.toLocaleString()}</strong></td>
                <td>${t('result.movesUnit', { n: item.moves })}</td>
                <td>${GameTimer.formatTime(item.timeMs)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  show() {
    this.renderItems();
    this.modalEl?.classList.remove('hidden');
  }

  hide() {
    this.modalEl?.classList.add('hidden');
  }
}

/**
 * 遊び方・ヘルプモーダル
 * ゲームの目的、基本ルール、操作方法、各種機能の詳細説明を提供する
 */
export class HelpModal {
  /**
   * @param {GameEngine} engine
   * @param {HTMLElement} container
   */
  constructor(engine, container) {
    this.engine = engine;
    this.container = container;
    /** @type {HTMLElement | null} */
    this.modalEl = null;

    this.render();
    this.bindEvents();

    // 言語切り替え時にHTMLのみ安全に再生成 (bindEventsの再帰実行は厳禁)
    i18n.onLanguageChange(() => {
      this.updateContent();
    });
  }

  render() {
    const modalWrapper = document.createElement('div');
    modalWrapper.className = 'modal-backdrop hidden';
    modalWrapper.id = 'help-modal';
    this.container.appendChild(modalWrapper);
    this.modalEl = modalWrapper;
    this.updateContent();
  }

  /**
   * 言語に応じたモーダル内容の更新
   */
  updateContent() {
    if (!this.modalEl) return;
    this.modalEl.innerHTML = `
      <div class="modal-card help-modal-card">
        <div class="modal-header-row">
          <div class="modal-header-title-group">
            <span class="modal-title-icon">📖</span>
            <h3 class="modal-card-title">${t('help.title')}</h3>
          </div>
          <button id="help-modal-close-icon" class="modal-close-icon-btn" title="${t('help.closeBtn')}">✕</button>
        </div>

        <div class="help-modal-body">
          <!-- 1. ゲームの目的 -->
          <section class="help-section">
            <h4 class="help-section-title">${t('help.goalTitle')}</h4>
            <p class="help-section-desc">
              ${t('help.goalDesc')}
            </p>
          </section>

          <!-- 2. 基本ルール -->
          <section class="help-section">
            <h4 class="help-section-title">${t('help.rulesTitle')}</h4>
            <ul class="help-list">
              <li>${t('help.rule1')}</li>
              <li>${t('help.rule2')}</li>
              <li>${t('help.rule3')}</li>
            </ul>
          </section>

          <!-- 3. 操作方法 -->
          <section class="help-section">
            <h4 class="help-section-title">${t('help.controlsTitle')}</h4>
            <div class="help-controls-grid">
              <div class="help-control-item">
                <span class="help-control-tag">${t('help.controlTapTag')}</span>
                <p>${t('help.controlTapDesc')}</p>
              </div>
              <div class="help-control-item">
                <span class="help-control-tag">${t('help.controlDragTag')}</span>
                <p>${t('help.controlDragDesc')}</p>
              </div>
              <div class="help-control-item">
                <span class="help-control-tag">${t('help.controlKeyTag')}</span>
                <p>${t('help.controlKeyDesc')}</p>
              </div>
            </div>
          </section>

          <!-- 4. 各種機能 -->
          <section class="help-section">
            <h4 class="help-section-title">${t('help.featuresTitle')}</h4>
            <ul class="help-list">
              <li>${t('help.feat1')}</li>
              <li>${t('help.feat2')}</li>
              <li>${t('help.feat3')}</li>
            </ul>
          </section>
        </div>

        <div class="help-modal-footer">
          <button id="help-modal-ok-btn" class="btn btn-primary">
            ${t('help.closeBtn')}
          </button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    this.engine.on('requestOpenHelp', () => {
      this.show();
    });

    // イベント委譲により、updateContent() で innerHTML が更新されてもリスナー再登録は一切不要
    this.modalEl?.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (
        target === this.modalEl ||
        target.id === 'help-modal-ok-btn' ||
        target.id === 'help-modal-close-icon' ||
        target.closest('#help-modal-ok-btn') ||
        target.closest('#help-modal-close-icon')
      ) {
        this.hide();
      }
    });
  }

  show() {
    this.modalEl?.classList.remove('hidden');
  }

  hide() {
    this.modalEl?.classList.add('hidden');
  }
}

/**
 * RTA走破完了リザルトモーダル
 */
export class RTAClearModal {
  /**
   * @param {GameEngine} engine
   * @param {HTMLElement} containerElement
   */
  constructor(engine, containerElement) {
    this.engine = engine;
    this.container = containerElement;
    this.confetti = new ConfettiCannon();
    /** @type {any} */
    this.lastData = null;
    /** @type {Blob | null} */
    this.preRenderedBlob = null;
    /** @type {Promise<Blob | null> | null} */
    this.renderPromise = null;
    /** @type {boolean} */
    this.isSharing = false;
    /** @type {((action: string, payload?: any) => void) | null} */
    this.onAction = null;
    /** @type {HTMLElement | null} */
    this.modalEl = null;

    this.render();
    this.bindEvents();

    i18n.onLanguageChange(() => {
      if (this.modalEl && !this.modalEl.classList.contains('hidden') && this.lastData) {
        this.updateContent();
        this.startPreRender();
      }
    });
  }

  /**
   * RTAリザルト画像を先行生成してメモリにキャッシュ (User Gesture 維持 & 待機ゼロ化)
   */
  startPreRender() {
    if (!this.lastData) return;
    this.preRenderedBlob = null;
    const { runState, result } = this.lastData;
    const shareUrl = `${window.location.origin}${window.location.pathname}?rta=1&salt=${encodeURIComponent(runState.initialSalt || '')}`;

    this.renderPromise = generateRTAResultCardBlob({
      runState,
      result,
      shareUrl
    }).then((blob) => {
      this.preRenderedBlob = blob;
      return blob;
    }).catch((err) => {
      console.warn('[PreRender RTA] Failed to generate card blob:', err);
      return null;
    });
  }

  /**
   * Controller へアクション通知
   * @param {string} action
   * @param {any} [payload]
   */
  dispatchAction(action, payload) {
    if (typeof this.onAction === 'function') {
      this.onAction(action, payload);
    }
  }

  render() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal-backdrop rta-clear-modal-backdrop hidden';
    this.container.appendChild(this.modalEl);
  }

  bindEvents() {
    this.engine.on('rtaComplete', (data) => {
      this.show(data);
    });

    this.modalEl?.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.id === 'rta-clear-retry-btn' || target.closest('#rta-clear-retry-btn')) {
        this.hide();
        this.dispatchAction('retryRTARun', { salt: this.lastData?.runState?.initialSalt });
      } else if (target.id === 'rta-clear-new-btn' || target.closest('#rta-clear-new-btn')) {
        this.hide();
        this.dispatchAction('newRTARun');
      } else if (target.id === 'rta-clear-exit-btn' || target.closest('#rta-clear-exit-btn')) {
        this.hide();
        this.dispatchAction('exitRTA');
      } else if (target.id === 'rta-clear-share-btn' || target.closest('#rta-clear-share-btn')) {
        const btn = /** @type {HTMLButtonElement} */ (target.id === 'rta-clear-share-btn' ? target : target.closest('#rta-clear-share-btn'));
        const labelEl = btn.querySelector('#rta-share-label');
        if (!this.lastData || !btn || !labelEl) return;
        if (this.isSharing) return; // 連打抑制

        this.isSharing = true;
        btn.setAttribute('disabled', 'true');
        btn.classList.add('btn-disabled');

        try {
          // プリレンダリング済みBlobを取得 (完了していなければ待機)
          let blob = this.preRenderedBlob;
          if (!blob && this.renderPromise) {
            const originalText = labelEl.textContent;
            labelEl.textContent = t('result.sharing');
            blob = await this.renderPromise;
            if (labelEl) labelEl.textContent = originalText;
          }

          if (!blob) {
            this.startPreRender();
            blob = await this.renderPromise;
          }

          if (!blob) throw new Error('RTA Blob generation failed');

          const { runState } = this.lastData;
          const shareUrl = `${window.location.origin}${window.location.pathname}?rta=1&salt=${encodeURIComponent(runState.initialSalt || '')}`;
          const modeName = runState.mode === 'marathon'
            ? `${t('rta.marathonShort')} (Lv10)`
            : `${t('rta.countupShort')} (${t('hud.tiers', { n: runState.baseHeight })})`;

          const tweetText = t('result.shareRtaTweetText', {
            mode: modeName,
            time: GameTimer.formatTime(runState.totalElapsedMs),
            moves: runState.totalMoves,
            score: runState.totalScore.toLocaleString()
          });

          await executeShare({
            blob,
            filename: `4lane-block-rta-${runState.mode}-${Date.now()}.png`,
            title: `4Lane Block RTA [${modeName}] Completed!`,
            text: tweetText,
            url: shareUrl,
            showToast
          });
        } catch (err) {
          console.error('RTA Share failed:', err);
        } finally {
          setTimeout(() => {
            this.isSharing = false;
            btn.removeAttribute('disabled');
            btn.classList.remove('btn-disabled');
          }, 1200);
        }
      }
    });
  }

  /**
   * @param {any} data
   */
  show(data) {
    this.lastData = data;
    this.updateContent();
    this.startPreRender(); // 先行プリレンダリング開始
    this.modalEl?.classList.remove('hidden');
    this.confetti.fire(120, true);
  }

  hide() {
    this.modalEl?.classList.add('hidden');
    this.confetti.stop();
  }

  updateContent() {
    if (!this.modalEl || !this.lastData) return;
    const { runState, result } = this.lastData;

    const modeName = runState.mode === 'marathon'
      ? `${t('rta.marathonShort')} (Lv10)`
      : `${t('rta.countupShort')} (${t('hud.tiers', { n: runState.baseHeight })})`;

    const isNew = result && result.isNewTimeRecord;

    // 総合スコア・タイム比較バッジの生成
    let compareBadgeHtml = '';
    const compareRecord = result?.compareRecord;
    if (result) {
      if (result.compareTarget === 'second' && result.scoreDiff !== null && result.timeDiffMs !== null) {
        const diffScoreStr = (result.scoreDiff >= 0 ? '+' : '') + result.scoreDiff.toLocaleString();
        const diffTimeStr = (result.timeDiffMs <= 0 ? '-' : '+') + GameTimer.formatTime(Math.abs(result.timeDiffMs));
        const text = t('rtaResult.compareSecond', { diffScore: diffScoreStr, diffTime: diffTimeStr });
        compareBadgeHtml = `<div class="rta-compare-badge second-best">${text}</div>`;
      } else if (result.compareTarget === 'best' && result.scoreDiff !== null && result.timeDiffMs !== null) {
        const diffScoreStr = (result.scoreDiff >= 0 ? '+' : '') + result.scoreDiff.toLocaleString();
        const diffTimeStr = (result.timeDiffMs <= 0 ? '-' : '+') + GameTimer.formatTime(Math.abs(result.timeDiffMs));
        const text = t('rtaResult.compareBest', { diffScore: diffScoreStr, diffTime: diffTimeStr });
        compareBadgeHtml = `<div class="rta-compare-badge vs-best">${text}</div>`;
      } else if (result.isFirstRun || result.compareTarget === 'none') {
        compareBadgeHtml = `<div class="rta-compare-badge first-run">${t('rtaResult.firstRun')}</div>`;
      }
    }

    // 各ステージ（各面）ラップタイム比較テーブルの生成
    const hasCompareSplits = Boolean(compareRecord && Array.isArray(compareRecord.splits));
    let splitsRowsHtml = '';
    if (Array.isArray(runState.splits)) {
      runState.splits.forEach((sp, idx) => {
        let compareLapTd = '';
        let diffTd = '';

        if (hasCompareSplits) {
          const compSp = compareRecord?.splits?.[idx];
          if (compSp) {
            const lapDiffMs = sp.lapTimeMs - compSp.lapTimeMs;
            const isFaster = lapDiffMs <= 0;
            const diffStr = (isFaster ? '-' : '+') + GameTimer.formatTime(Math.abs(lapDiffMs));
            const diffClass = isFaster ? 'lap-diff-faster' : 'lap-diff-slower';

            compareLapTd = `<td>${GameTimer.formatTime(compSp.lapTimeMs)}</td>`;
            diffTd = `<td class="${diffClass}">${diffStr}</td>`;
          } else {
            compareLapTd = `<td>--:--.--</td>`;
            diffTd = `<td>--</td>`;
          }
        }

        const stageDisplayName = runState.mode === 'marathon' ? t('hud.tiers', { n: sp.stageParam || (3 + idx) }) : `Lv ${sp.stageParam || (1 + idx)}`;
        splitsRowsHtml += `
          <tr>
            <td>${stageDisplayName}</td>
            <td><strong>${GameTimer.formatTime(sp.lapTimeMs)}</strong></td>
            ${compareLapTd}
            ${diffTd}
            <td>${GameTimer.formatTime(sp.totalTimeMs)}</td>
            <td>${sp.moves}</td>
            <td>${sp.score.toLocaleString()}</td>
          </tr>
        `;
      });
    }

    const tableHeaderHtml = hasCompareSplits
      ? `
        <tr>
          <th>${t('rta.colStage')}</th>
          <th>${t('rta.splitsLap')}</th>
          <th>${t('rtaResult.compareLapHeader')}</th>
          <th>${t('rtaResult.compareDiffHeader')}</th>
          <th>${t('rta.splitsTotal')}</th>
          <th>${t('hud.moves')}</th>
          <th>${t('rta.splitsScore')}</th>
        </tr>
      `
      : `
        <tr>
          <th>${t('rta.colStage')}</th>
          <th>${t('rta.splitsLap')}</th>
          <th>${t('rta.splitsTotal')}</th>
          <th>${t('hud.moves')}</th>
          <th>${t('rta.splitsScore')}</th>
        </tr>
      `;

    this.modalEl.innerHTML = `
      <div class="modal-card rta-clear-modal-card">
        <div class="rta-clear-header">
          <h2 class="rta-clear-title">${t('rta.completeTitle')}</h2>
          <p class="rta-clear-subtitle">${t('rta.completeSubtitle')} (${modeName})</p>
          ${isNew ? `<div class="rta-new-record-badge">${t('rta.newRecord')}</div>` : ''}
          ${compareBadgeHtml}
        </div>

        <div class="rta-clear-summary-grid">
          <div class="rta-summary-card primary">
            <span class="rta-summary-label">${t('rta.totalRunTime')}</span>
            <strong class="rta-summary-val">${GameTimer.formatTime(runState.totalElapsedMs)}</strong>
          </div>
          <div class="rta-summary-card">
            <span class="rta-summary-label">${t('rta.finalScore')}</span>
            <strong class="rta-summary-val">${runState.totalScore.toLocaleString()}</strong>
          </div>
          <div class="rta-summary-card">
            <span class="rta-summary-label">${t('rta.totalMoves')}</span>
            <strong class="rta-summary-val">${runState.totalMoves}</strong>
          </div>
        </div>

        <div class="rta-splits-detail-container">
          <table class="rta-detail-table">
            <thead>
              ${tableHeaderHtml}
            </thead>
            <tbody>
              ${splitsRowsHtml}
            </tbody>
          </table>
        </div>

        <div class="rta-clear-actions rta-clear-share-action">
          <button id="rta-clear-share-btn" class="btn btn-share btn-block">
            <span class="btn-share-icon">📸</span>
            <span id="rta-share-label">${t('result.shareBtnRTA')}</span>
          </button>
        </div>

        <div class="rta-clear-actions">
          <button id="rta-clear-retry-btn" class="btn btn-secondary">
            ${t('rta.retryRunBtn')}
          </button>
          <button id="rta-clear-new-btn" class="btn btn-primary">
            ${t('rta.newRunBtn')}
          </button>
          <button id="rta-clear-exit-btn" class="btn btn-outline">
            ${t('rta.exitRtaBtn')}
          </button>
        </div>
      </div>
    `;
  }
}

/**
 * RTAハイスコア一覧モーダル (マラソン / カウントアップ段数スライダー & 各面ラップタイム詳細)
 */
export class RTAScoreListModal {
  /**
   * @param {GameEngine} engine
   * @param {HTMLElement} containerElement
   */
  constructor(engine, containerElement) {
    this.engine = engine;
    this.container = containerElement;
    /** @type {((action: string, payload?: any) => void) | null} */
    this.onAction = null;
    /** @type {HTMLElement | null} */
    this.modalEl = null;
    /** @type {'marathon' | 'countup'} */
    this.currentMode = 'marathon';
    this.currentHeight = 10;

    this.render();
    this.bindEvents();

    i18n.onLanguageChange(() => {
      this.updateTexts();
    });
  }

  /**
   * @param {string} action
   * @param {any} [payload]
   */
  dispatchAction(action, payload) {
    if (typeof this.onAction === 'function') {
      this.onAction(action, payload);
    }
  }

  render() {
    const modalWrapper = document.createElement('div');
    modalWrapper.id = 'rta-score-list-modal';
    modalWrapper.className = 'modal-backdrop rta-score-modal-backdrop hidden';
    modalWrapper.innerHTML = `
      <div class="modal-card rta-score-list-card">
        <div class="overlay-card-header">
          <span class="shield-icon">🏃</span>
          <div style="flex: 1;">
            <h3 class="rta-score-modal-title">${t('rtaScoreList.title')}</h3>
          </div>
          <button id="rta-score-back-btn" class="btn btn-sm btn-secondary" style="margin-right: 8px;">
            ${t('rtaScoreList.backToNormalBtn')}
          </button>
          <button id="rta-score-modal-close-btn" class="modal-close-icon-btn" title="${t('scoreList.closeBtn')}">✕</button>
        </div>

        <div class="rta-tabs">
          <button class="rta-tab-btn active" data-tab="marathon">${t('rtaScoreList.marathonTab')}</button>
          <button class="rta-tab-btn" data-tab="countup">${t('rtaScoreList.countupTab')}</button>
        </div>

        <div id="rta-score-slider-box" class="rta-score-slider-box hidden">
          <div class="rta-slider-label-row">
            <span class="rta-slider-label-text">${t('rtaScoreList.sliderLabel')}</span>
            <strong id="rta-score-slider-val" class="highlight-val">${t('hud.tiers', { n: this.currentHeight })}</strong>
          </div>
          <input type="range" id="rta-score-height-slider" min="3" max="15" value="${this.currentHeight}" step="1" class="rta-range-slider" />
        </div>

        <div class="rta-score-body" id="rta-score-body">
          <!-- 記録サマリーとスプリット表 -->
        </div>

        <div class="score-list-footer">
          <button id="rta-score-reset-btn" class="btn btn-outline-danger" title="${t('rtaScoreList.resetBtn')}">
            ${t('rtaScoreList.resetBtn')}
          </button>
          <button id="rta-score-ok-btn" class="btn btn-primary">
            ${t('scoreList.closeBtn')}
          </button>
        </div>
      </div>

      <!-- リセット確認ダイアログ -->
      <div id="rta-score-reset-confirm" class="confirm-overlay hidden">
        <div class="confirm-dialog-card">
          <div class="confirm-dialog-icon">⚠️</div>
          <h4 class="confirm-dialog-title">${t('rtaScoreList.confirmTitle')}</h4>
          <p class="confirm-dialog-desc">${t('rtaScoreList.confirmDesc')}<br><span class="confirm-warning">${t('rtaScoreList.confirmWarning')}</span></p>
          <div class="confirm-dialog-actions">
            <button id="rta-confirm-cancel-btn" class="btn btn-secondary">${t('scoreList.cancelBtn')}</button>
            <button id="rta-confirm-execute-btn" class="btn btn-danger">${t('scoreList.deleteBtn')}</button>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(modalWrapper);
    this.modalEl = modalWrapper;
  }

  bindEvents() {
    this.engine.on('requestOpenRTAScoreList', () => {
      this.show();
    });

    const closeBtn = this.modalEl?.querySelector('#rta-score-modal-close-btn');
    closeBtn?.addEventListener('click', () => this.hide());

    const okBtn = this.modalEl?.querySelector('#rta-score-ok-btn');
    okBtn?.addEventListener('click', () => this.hide());

    const backBtn = this.modalEl?.querySelector('#rta-score-back-btn');
    backBtn?.addEventListener('click', () => {
      this.hide();
      this.engine.emit('requestOpenScoreList');
    });

    // タブ切り替え
    const tabBtns = this.modalEl?.querySelectorAll('.rta-tab-btn');
    tabBtns?.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement} */ (e.currentTarget);
        const tab = target.getAttribute('data-tab');
        if (tab === 'marathon' || tab === 'countup') {
          this.currentMode = tab;
          tabBtns.forEach((b) => b.classList.remove('active'));
          target.classList.add('active');
          const sliderBox = this.modalEl?.querySelector('#rta-score-slider-box');
          if (tab === 'countup') {
            sliderBox?.classList.remove('hidden');
          } else {
            sliderBox?.classList.add('hidden');
          }
          this.renderContent();
        }
      });
    });

    // スライダー操作
    const slider = /** @type {HTMLInputElement | null} */ (this.modalEl?.querySelector('#rta-score-height-slider'));
    const sliderVal = this.modalEl?.querySelector('#rta-score-slider-val');
    slider?.addEventListener('input', (e) => {
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      this.currentHeight = val;
      if (sliderVal) sliderVal.textContent = t('hud.tiers', { n: val });
      this.renderContent();
    });

    // リセットボタン
    const resetBtn = this.modalEl?.querySelector('#rta-score-reset-btn');
    const confirmOverlay = this.modalEl?.querySelector('#rta-score-reset-confirm');
    const cancelBtn = this.modalEl?.querySelector('#rta-confirm-cancel-btn');
    const executeBtn = this.modalEl?.querySelector('#rta-confirm-execute-btn');

    resetBtn?.addEventListener('click', () => {
      confirmOverlay?.classList.remove('hidden');
    });

    cancelBtn?.addEventListener('click', () => {
      confirmOverlay?.classList.add('hidden');
    });

    executeBtn?.addEventListener('click', () => {
      confirmOverlay?.classList.add('hidden');
      this.dispatchAction('resetAllRTA');
      this.renderContent();
    });

    // モーダル背景クリック
    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl && confirmOverlay?.classList.contains('hidden')) {
        this.hide();
      }
    });
  }

  show() {
    this.renderContent();
    this.modalEl?.classList.remove('hidden');
  }

  hide() {
    this.modalEl?.classList.add('hidden');
  }

  updateTexts() {
    if (!this.modalEl) return;
    const title = this.modalEl.querySelector('.rta-score-modal-title');
    if (title) title.textContent = t('rtaScoreList.title');

    const backBtn = this.modalEl.querySelector('#rta-score-back-btn');
    if (backBtn) backBtn.textContent = t('rtaScoreList.backToNormalBtn');

    const closeBtn = this.modalEl.querySelector('#rta-score-modal-close-btn');
    if (closeBtn) closeBtn.setAttribute('title', t('scoreList.closeBtn'));

    const tabMarathon = this.modalEl.querySelector('.rta-tab-btn[data-tab="marathon"]');
    if (tabMarathon) tabMarathon.textContent = t('rtaScoreList.marathonTab');

    const tabCountup = this.modalEl.querySelector('.rta-tab-btn[data-tab="countup"]');
    if (tabCountup) tabCountup.textContent = t('rtaScoreList.countupTab');

    const sliderLabel = this.modalEl.querySelector('.rta-slider-label-text');
    if (sliderLabel) sliderLabel.textContent = t('rtaScoreList.sliderLabel');

    const sliderVal = this.modalEl.querySelector('#rta-score-slider-val');
    if (sliderVal) sliderVal.textContent = t('hud.tiers', { n: this.currentHeight });

    const resetBtn = this.modalEl.querySelector('#rta-score-reset-btn');
    if (resetBtn) {
      resetBtn.textContent = t('rtaScoreList.resetBtn');
      resetBtn.setAttribute('title', t('rtaScoreList.resetBtn'));
    }

    const okBtn = this.modalEl.querySelector('#rta-score-ok-btn');
    if (okBtn) okBtn.textContent = t('scoreList.closeBtn');

    const confirmTitle = this.modalEl.querySelector('.confirm-dialog-title');
    if (confirmTitle) confirmTitle.textContent = t('rtaScoreList.confirmTitle');

    const confirmDesc = this.modalEl.querySelector('.confirm-dialog-desc');
    if (confirmDesc) {
      confirmDesc.innerHTML = `${t('rtaScoreList.confirmDesc')}<br><span class="confirm-warning">${t('rtaScoreList.confirmWarning')}</span>`;
    }

    const cancelBtn = this.modalEl.querySelector('#rta-confirm-cancel-btn');
    if (cancelBtn) cancelBtn.textContent = t('scoreList.cancelBtn');

    const executeBtn = this.modalEl.querySelector('#rta-confirm-execute-btn');
    if (executeBtn) executeBtn.textContent = t('scoreList.deleteBtn');

    this.renderContent();
  }

  renderContent() {
    if (!this.modalEl) return;
    const bodyEl = this.modalEl.querySelector('#rta-score-body');
    if (!bodyEl) return;

    const record = getRTARecord(this.currentMode, this.currentHeight);
    if (!record) {
      bodyEl.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🏁</span>
          <p>${t('rtaScoreList.noRecord')}</p>
        </div>
      `;
      return;
    }

    let splitsRowsHtml = '';
    if (Array.isArray(record.splits)) {
      for (const sp of record.splits) {
        splitsRowsHtml += `
          <tr>
            <td>${sp.stageName}</td>
            <td><strong>${GameTimer.formatTime(sp.lapTimeMs)}</strong></td>
            <td>${GameTimer.formatTime(sp.totalTimeMs)}</td>
            <td>${sp.moves}</td>
            <td>${sp.score.toLocaleString()}</td>
          </tr>
        `;
      }
    }

    bodyEl.innerHTML = `
      <div class="rta-record-summary-panel">
        <div class="rta-summary-grid">
          <div class="rta-summary-card primary">
            <span class="rta-summary-label">${t('rtaScoreList.totalTime')}</span>
            <strong class="rta-summary-val">${GameTimer.formatTime(record.bestTotalTimeMs)}</strong>
          </div>
          <div class="rta-summary-card">
            <span class="rta-summary-label">${t('rtaScoreList.totalScore')}</span>
            <strong class="rta-summary-val">${record.bestScore.toLocaleString()}</strong>
          </div>
          <div class="rta-summary-card">
            <span class="rta-summary-label">${t('rtaScoreList.totalMoves')}</span>
            <strong class="rta-summary-val">${record.totalMoves}</strong>
          </div>
        </div>
        <div class="rta-meta-info-row">
          <span>${t('rtaScoreList.date')} <strong>${new Date(record.date).toLocaleString()}</strong></span>
          <span>${t('rtaScoreList.salt')} <code>${record.salt}</code></span>
        </div>
      </div>

      <div class="rta-splits-section">
        <h4 class="rta-splits-header">${t('rtaScoreList.splitsTitle')}</h4>
        <div class="rta-splits-detail-container">
          <table class="rta-detail-table">
            <thead>
              <tr>
                <th>${t('rtaScoreList.colStage')}</th>
                <th>${t('rtaScoreList.colLap')}</th>
                <th>${t('rtaScoreList.colTotal')}</th>
                <th>${t('rtaScoreList.colMoves')}</th>
                <th>${t('rtaScoreList.colScore')}</th>
              </tr>
            </thead>
            <tbody>
              ${splitsRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}


