// @ts-check
import { GameTimer } from '../core/timer.js?v=3.9';
import { getRTARecord } from '../core/storage.js?v=3.9';
import { t, i18n } from '../i18n/index.js?v=3.9';

/**
 * RTAスプリット比較枠 (LiveSplit風 画面右側HUD)
 */
export class RTASplitsView {
  /**
   * @param {import('../core/game_engine.js').GameEngine} engine
   * @param {HTMLElement} parentElement
   */
  constructor(engine, parentElement) {
    this.engine = engine;
    this.parent = parentElement;
    /** @type {HTMLElement | null} */
    this.panelEl = null;
    /** @type {import('./types.js').RTARecord | null} */
    this.cachedBestRecord = null;
    /** @type {((action: string, payload?: any) => void) | null} */
    this.onAction = null;

    this.bindEngineEvents();

    i18n.onLanguageChange(() => {
      if (this.engine.rtaState && this.engine.rtaState.active) {
        this.render();
      }
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

  /**
   * ゲームエンジンイベント購読
   */
  bindEngineEvents() {
    this.engine.on('rtaStart', () => {
      this.initBestRecord();
      this.render();
    });

    this.engine.on('rtaTick', (runState) => {
      this.updateTick(runState);
    });

    this.engine.on('rtaStageClear', () => {
      this.updateTable();
    });

    this.engine.on('rtaStageAdvance', () => {
      this.updateTable();
    });

    this.engine.on('rtaComplete', () => {
      this.updateTable();
    });

    this.engine.on('rtaAbort', () => {
      this.remove();
    });

    // 通常モードへの切り替え・状態更新時のフェイルセーフ (RTA非アクティブなら確実に消去)
    this.engine.on('stateChange', () => {
      if (!this.engine.rtaState || !this.engine.rtaState.active) {
        this.remove();
      }
    });
  }

  /**
   * 現在のモード・段数に対応するベスト記録をロード
   */
  initBestRecord() {
    const runState = this.engine.rtaState;
    if (!runState) {
      this.cachedBestRecord = null;
      return;
    }
    this.cachedBestRecord = getRTARecord(runState.mode, runState.baseHeight);
  }

  /**
   * スプリット枠のDOM生成・描画
   */
  render() {
    const runState = this.engine.rtaState;
    if (!runState || !runState.active) {
      this.remove();
      return;
    }

    if (!this.panelEl) {
      this.panelEl = document.createElement('aside');
      this.panelEl.className = 'rta-splits-panel';
      this.panelEl.id = 'rta-splits-panel';
      this.parent.appendChild(this.panelEl);
    }

    const modeTitle = runState.mode === 'marathon'
      ? `${t('rta.marathonShort')} (Lv10)`
      : `${t('rta.countupShort')} (${t('hud.tiers', { n: runState.baseHeight })})`;

    this.panelEl.innerHTML = `
      <div class="rta-splits-header">
        <div class="rta-splits-badge">🏃 RTA</div>
        <div class="rta-splits-title">${modeTitle}</div>
        <div class="rta-total-time" id="rta-total-time-display">${GameTimer.formatTime(runState.totalElapsedMs)}</div>
      </div>

      <div class="rta-splits-table-wrapper">
        <table class="rta-splits-table">
          <thead>
            <tr>
              <th class="th-stage">${t('rta.colStage')}</th>
              <th class="th-best">${t('rta.colBest')}</th>
              <th class="th-time">${t('rta.colTime')}</th>
              <th class="th-diff">${t('rta.colDiff')}</th>
            </tr>
          </thead>
          <tbody id="rta-splits-tbody"></tbody>
        </table>
      </div>

      <div class="rta-splits-footer">
        <div class="rta-footer-row">
          <span class="rta-footer-label">${t('rta.currentLap')}</span>
          <span class="rta-footer-val" id="rta-current-lap-display">${GameTimer.formatTime(runState.currentLapElapsedMs)}</span>
        </div>
        <div class="rta-footer-row">
          <span class="rta-footer-label">${t('rta.totalScore')}</span>
          <span class="rta-footer-val" id="rta-total-score-display">${runState.totalScore.toLocaleString()}</span>
        </div>
        <button id="rta-abort-btn" class="btn btn-xs btn-outline-danger rta-abort-btn">${t('rta.abortBtn')}</button>
      </div>
    `;

    // リタイアボタン
    const abortBtn = this.panelEl.querySelector('#rta-abort-btn');
    abortBtn?.addEventListener('click', () => {
      this.dispatchAction('abortRTARun');
    });

    this.updateTable();
  }

  /**
   * スプリット表（行一覧）の差分更新
   */
  updateTable() {
    if (!this.panelEl) return;
    const tbody = this.panelEl.querySelector('#rta-splits-tbody');
    if (!tbody) return;

    const runState = this.engine.rtaState;
    if (!runState) return;

    let html = '';
    const totalStages = runState.totalStages;

    for (let i = 0; i < totalStages; i++) {
      let stageName = '';
      if (runState.mode === 'marathon') {
        stageName = `${3 + i}段`;
      } else {
        stageName = `Lv ${1 + i}`;
      }

      const completedSplit = runState.splits[i];
      const isCurrent = runState.active && runState.currentStageIndex === i;
      const bestSplit = this.cachedBestRecord && this.cachedBestRecord.splits
        ? this.cachedBestRecord.splits[i]
        : null;

      const bestTimeStr = bestSplit ? GameTimer.formatTime(bestSplit.totalTimeMs) : '---';

      let timeStr = '---';
      let diffStr = '';
      let diffClass = '';
      let rowClass = '';

      if (completedSplit) {
        // 完了済みステージ
        timeStr = GameTimer.formatTime(completedSplit.totalTimeMs);
        rowClass = 'stage-completed';

        if (bestSplit) {
          const deltaMs = completedSplit.totalTimeMs - bestSplit.totalTimeMs;
          const sign = deltaMs > 0 ? '+' : '-';
          const absSec = (Math.abs(deltaMs) / 1000).toFixed(1);
          diffStr = `${sign}${absSec}`;
          diffClass = deltaMs <= 0 ? 'diff-ahead' : 'diff-behind';
        }
      } else if (isCurrent) {
        // 現在走破中ステージ
        timeStr = '▶ RUN';
        rowClass = 'stage-active';

        if (bestSplit) {
          const currentTotal = runState.totalElapsedMs;
          const deltaMs = currentTotal - bestSplit.totalTimeMs;
          if (deltaMs > 0) {
            const absSec = (deltaMs / 1000).toFixed(1);
            diffStr = `+${absSec}`;
            diffClass = 'diff-behind';
          }
        }
      } else {
        rowClass = 'stage-pending';
      }

      html += `
        <tr class="split-row ${rowClass}">
          <td class="col-stage">${stageName}</td>
          <td class="col-best">${bestTimeStr}</td>
          <td class="col-time">${timeStr}</td>
          <td class="col-diff ${diffClass}">${diffStr}</td>
        </tr>
      `;
    }

    tbody.innerHTML = html;
  }

  /**
   * タイマーTickごとのリアルタイム更新 (60fps/100ms)
   * @param {import('./types.js').RTARunState} runState
   */
  updateTick(runState) {
    if (!this.panelEl) return;

    const totalEl = this.panelEl.querySelector('#rta-total-time-display');
    if (totalEl) {
      totalEl.textContent = GameTimer.formatTime(runState.totalElapsedMs);
    }

    const lapEl = this.panelEl.querySelector('#rta-current-lap-display');
    if (lapEl) {
      lapEl.textContent = GameTimer.formatTime(runState.currentLapElapsedMs);
    }

    const scoreEl = this.panelEl.querySelector('#rta-total-score-display');
    if (scoreEl) {
      scoreEl.textContent = runState.totalScore.toLocaleString();
    }

    // 現在走行中ステージの遅延差分をリアルタイム更新
    const activeRow = this.panelEl.querySelector('.stage-active');
    if (activeRow && this.cachedBestRecord && this.cachedBestRecord.splits) {
      const bestSplit = this.cachedBestRecord.splits[runState.currentStageIndex];
      if (bestSplit) {
        const deltaMs = runState.totalElapsedMs - bestSplit.totalTimeMs;
        const diffCell = activeRow.querySelector('.col-diff');
        if (diffCell) {
          if (deltaMs > 0) {
            diffCell.textContent = `+${(deltaMs / 1000).toFixed(1)}`;
            diffCell.className = 'col-diff diff-behind';
          } else {
            diffCell.textContent = '';
            diffCell.className = 'col-diff';
          }
        }
      }
    }
  }

  /**
   * パネルの破棄
   */
  remove() {
    if (this.panelEl && this.panelEl.parentElement) {
      this.panelEl.parentElement.removeChild(this.panelEl);
    }
    this.panelEl = null;
  }
}
