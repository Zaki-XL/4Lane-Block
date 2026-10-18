// @ts-check
import { ColorConfig } from '../core/types.js';
import { getHighScore, getRTARecord } from '../core/storage.js';
import { generateRandomSalt } from '../core/prng.js';
import { GameTimer } from '../core/timer.js';
import { t, i18n } from '../i18n/index.js';
import { RTASplitsView } from './rta_view.js';

/**
 * 盤面描画レンダラー (View: 差分DOM更新 & rAFスロットリング最適化版)
 * ブラウザの表示領域に合わせてブロックの高さを動的にスケーリングし、常に1画面に収める
 */
export class BoardRenderer {
  /**
   * @param {HTMLElement} containerElement - 盤面を描画する親コンテナ
   * @param {import('../core/game_engine.js').GameEngine} engine - ゲームエンジン
   */
  constructor(containerElement, engine) {
    this.container = containerElement;
    this.engine = engine;
    this.focusedLaneIndex = 0;
    this.currentHeightLimit = 10;
    this.renderedHeightLimit = 0;
    /** @type {string | null} */
    this.lastDroppedBlockId = null;
    this.isSettingsOpen = false;
    this.isRTASettingsOpen = false;
    /** @type {'marathon' | 'countup'} */
    this.selectedRtaMode = 'marathon';
    this.selectedRtaHeight = 10;
    /** @type {HTMLElement | null} */
    this.settingsModalEl = null;
    /** @type {number | null} */
    this.resizeRafId = null;

    /** @type {((action: string, payload?: any) => void) | null} */
    this.onAction = null;

    // RTA スプリット枠の生成 (盤面コンテナ右側に配置)
    this.rtaView = new RTASplitsView(this.engine, this.container);
    this.rtaView.onAction = (action, payload) => {
      this.dispatchAction(action, payload);
    };

    // ゲームクリア・RTAステージクリア時の演出購読
    this.engine.on('gameClear', () => {
      this.triggerVictoryWave();
    });
    this.engine.on('rtaStageClear', () => {
      this.triggerVictoryWave();
    });

    // ⚙️ 設定モーダル要求購読
    this.engine.on('requestOpenSettings', () => {
      this.isSettingsOpen = true;
      this.isRTASettingsOpen = false;
      this.render(this.engine.getState());
    });

    // ウィンドウリサイズ時に動的スケーリングを再計算
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);

    // 言語切り替え時に再描画
    i18n.onLanguageChange(() => {
      this.render(this.engine.getState());
    });
  }

  /**
   * Controller へユーザーアクションを通知 (MVC: View -> Controller)
   * @param {string} action
   * @param {any} [payload]
   */
  dispatchAction(action, payload) {
    if (typeof this.onAction === 'function') {
      this.onAction(action, payload);
    }
  }

  /**
   * 勝利ウェーブ演出 (クリア時に完成3レーンのブロックを順次波打たせる)
   */
  triggerVictoryWave() {
    const winnerBlocks = this.container.querySelectorAll('.lane .block');
    winnerBlocks.forEach((blockEl, idx) => {
      const delay = (idx % 10) * 0.05 + Math.floor(idx / 10) * 0.08;
      // @ts-ignore
      blockEl.style.animationDelay = `${delay}s`;
      blockEl.classList.add('block-winner');
    });
  }

  /**
   * リサイズイベントハンドラ (requestAnimationFrame で 60fps スロットリング)
   */
  handleResize() {
    if (this.resizeRafId !== null) {
      cancelAnimationFrame(this.resizeRafId);
    }
    this.resizeRafId = requestAnimationFrame(() => {
      this.resizeRafId = null;
      this.updateViewportFit(this.currentHeightLimit);
    });
  }

  /**
   * ブラウザ表示域からブロック高さを算出し、CSS変数に反映する (1画面フィット)
   * @param {number} heightLimit
   */
  updateViewportFit(heightLimit) {
    this.currentHeightLimit = heightLimit;

    const header = document.querySelector('.header');
    const controls = document.querySelector('#controls');
    const instructions = document.querySelector('.instructions-panel');

    const headerH = header ? header.getBoundingClientRect().height : 50;
    const controlsH = controls ? controls.getBoundingClientRect().height : 70;
    const instructionsH = instructions ? instructions.getBoundingClientRect().height : 45;
    const appPadding = 20;
    const laneHeaderBaseH = 40;

    const windowH = window.innerHeight;
    const overhead = headerH + controlsH + instructionsH + appPadding + laneHeaderBaseH;

    const availableH = Math.max(100, windowH - overhead);
    const gapTotal = (heightLimit - 1) * 3;
    const rawSlotH = Math.floor((availableH - gapTotal) / heightLimit);

    const optimalSlotH = Math.max(16, Math.min(52, rawSlotH));
    const optimalFontSize = Math.max(8, Math.min(13, Math.floor(optimalSlotH * 0.42)));

    document.documentElement.style.setProperty('--slot-height', `${optimalSlotH}px`);
    document.documentElement.style.setProperty('--block-font-size', `${optimalFontSize}px`);
    document.documentElement.style.setProperty('--height-limit', `${heightLimit}`);
  }

  /**
   * キーボードフォーカス位置の更新
   * @param {number} index
   */
  setKeyboardFocus(index) {
    this.focusedLaneIndex = index;
    const lanes = this.container.querySelectorAll('.lane');
    lanes.forEach((el, i) => {
      if (i === index) {
        el.classList.add('keyboard-focused');
      } else {
        el.classList.remove('keyboard-focused');
      }
    });
  }

  /**
   * 4レーンおよび各スロットのDOM構造を新規生成
   * @private
   * @param {number} heightLimit
   * @returns {HTMLElement}
   */
  createLanesStructure(heightLimit) {
    const lanesWrapper = document.createElement('div');
    lanesWrapper.className = 'lanes-wrapper';

    for (let laneIdx = 0; laneIdx < 4; laneIdx++) {
      const laneEl = document.createElement('div');
      laneEl.className = 'lane';
      laneEl.setAttribute('data-lane-index', String(laneIdx));

      // ヘッダー
      const headerEl = document.createElement('div');
      headerEl.className = 'lane-header';
      headerEl.innerHTML = `<span class="lane-num">[${laneIdx + 1}] L${laneIdx + 1}</span><span class="lane-cap">0/${heightLimit}</span>`;
      laneEl.appendChild(headerEl);

      // スロットコンテナ (下から上へ積み上げる)
      const slotsContainer = document.createElement('div');
      slotsContainer.className = 'slots-container';

      for (let slotIdx = heightLimit - 1; slotIdx >= 0; slotIdx--) {
        const slotEl = document.createElement('div');
        slotEl.className = 'slot slot-empty';
        slotsContainer.appendChild(slotEl);
      }

      laneEl.appendChild(slotsContainer);

      // レーン底面ベース
      const baseEl = document.createElement('div');
      baseEl.className = 'lane-base';
      laneEl.appendChild(baseEl);

      lanesWrapper.appendChild(laneEl);
    }

    return lanesWrapper;
  }

  /**
   * 盤面の最新状態を描画する (DOM構造のキャッシュと差分更新: パフォーマンス最適化)
   * @param {import('../core/types.js').GameState} state
   */
  render(state) {
    this.updateViewportFit(state.heightLimit);

    const isIdle = state.timerStatus === 'idle';
    const showModal = this.isSettingsOpen || isIdle;

    let lanesWrapper = this.container.querySelector('.lanes-wrapper');
    const structureNeedsRebuild = !lanesWrapper || this.renderedHeightLimit !== state.heightLimit;

    if (structureNeedsRebuild) {
      if (lanesWrapper) {
        lanesWrapper.remove();
      }
      lanesWrapper = this.createLanesStructure(state.heightLimit);
      if (this.settingsModalEl && this.settingsModalEl.parentNode === this.container) {
        this.container.insertBefore(lanesWrapper, this.settingsModalEl);
      } else {
        this.container.appendChild(lanesWrapper);
      }
      this.renderedHeightLimit = state.heightLimit;
    }

    // ブラー切り替え
    lanesWrapper.className = `lanes-wrapper ${showModal ? 'board-blurred' : ''}`;

    const laneElements = lanesWrapper.querySelectorAll('.lane');
    for (let laneIdx = 0; laneIdx < 4; laneIdx++) {
      const lane = state.lanes[laneIdx];
      const isSelected = state.selectedLaneIndex === laneIdx;
      const isFocused = this.focusedLaneIndex === laneIdx;
      const laneEl = laneElements[laneIdx];

      laneEl.classList.toggle('lane-selected', isSelected);
      laneEl.classList.toggle('keyboard-focused', isFocused);

      // レーン容量ヘッダーの更新
      const capEl = laneEl.querySelector('.lane-cap');
      if (capEl) capEl.textContent = `${lane.length}/${state.heightLimit}`;

      // スロット一覧の差分更新
      const slotElements = laneEl.querySelectorAll('.slot');
      for (let slotIdx = state.heightLimit - 1; slotIdx >= 0; slotIdx--) {
        const visualIdx = (state.heightLimit - 1) - slotIdx;
        const slotEl = slotElements[visualIdx];
        const block = lane[slotIdx];

        if (block) {
          slotEl.classList.remove('slot-empty');
          const isTop = slotIdx === lane.length - 1;
          const isPickedUp = isSelected && isTop;

          let blockEl = slotEl.querySelector('.block');
          if (!blockEl || blockEl.getAttribute('data-block-id') !== block.id) {
            slotEl.innerHTML = '';
            blockEl = this.createBlockElement(block, isTop, isPickedUp, showModal);
            slotEl.appendChild(blockEl);
          } else {
            this.updateExistingBlockElement(blockEl, block, isTop, isPickedUp, showModal);
          }
        } else {
          slotEl.className = 'slot slot-empty';
          slotEl.innerHTML = '';
        }
      }
    }

    // 設定モーダルの表示・非表示
    if (showModal) {
      this.renderSettingsModal(state, isIdle);
    } else {
      this.removeSettingsModal();
    }
  }

  /**
   * 既存のブロック要素の属性・クラスを差分更新
   * @private
   */
  updateExistingBlockElement(el, block, isTop, isPickedUp, isScrambling) {
    el.classList.toggle('picked-up', isPickedUp);
    el.classList.toggle('idle-scrambling', isScrambling);

    if (isTop) {
      el.setAttribute('data-is-top', 'true');
      el.setAttribute('draggable', 'true');
      el.title = t('app.moveTip');
    } else {
      el.removeAttribute('data-is-top');
      el.removeAttribute('draggable');
      el.removeAttribute('title');
    }

    const label = el.querySelector('.block-label');
    const colorKey = `block.${block.color.toLowerCase()}`;
    const expected = t(colorKey);
    if (label && label.textContent !== expected) {
      label.textContent = expected;
    }
  }

  /**
   * 設定モーダルを閉じる / 削除する
   */
  removeSettingsModal() {
    if (this.settingsModalEl) {
      this.settingsModalEl.remove();
      this.settingsModalEl = null;
    }
  }

  /**
   * 通常設定モーダルのテキストを現在の言語辞書に合わせて差分更新
   * @param {import('../core/types.js').GameState} state
   */
  updateSettingsModalTexts(state) {
    if (!this.settingsModalEl) return;
    const modal = this.settingsModalEl;
    const titleEl = modal.querySelector('.start-overlay-title');
    if (titleEl) titleEl.textContent = t('settings.title');

    const openRtaBtn = modal.querySelector('#overlay-open-rta-btn');
    if (openRtaBtn) {
      openRtaBtn.textContent = t('rta.btn');
      openRtaBtn.setAttribute('title', t('rta.btn'));
    }

    const heightLabel = modal.querySelector('#overlay-height-label');
    if (heightLabel) heightLabel.textContent = t('settings.heightLabel');

    const heightSlider = modal.querySelector('#overlay-height-slider');
    // @ts-ignore
    const currentHeight = heightSlider ? parseInt(heightSlider.value, 10) : state.heightLimit;
    const heightText = modal.querySelector('#overlay-height-text');
    if (heightText) heightText.textContent = t('hud.tiers', { n: currentHeight });

    const diffLabel = modal.querySelector('#overlay-diff-label');
    if (diffLabel) diffLabel.textContent = t('settings.diffLabel');

    const diffSlider = modal.querySelector('#overlay-diff-slider');
    // @ts-ignore
    const currentDiff = diffSlider ? parseInt(diffSlider.value, 10) : (state.difficultyLevel || 5);
    const diffText = modal.querySelector('#overlay-diff-text');
    if (diffText) diffText.textContent = `Lv ${currentDiff} ${t('difficulty.' + currentDiff)}`;

    const bestConfigEl = modal.querySelector('#overlay-best-config');
    if (bestConfigEl) bestConfigEl.textContent = `${t('hud.tiers', { n: currentHeight })} Lv${currentDiff}`;

    const bestScoreEl = modal.querySelector('#overlay-best-score');
    const bestRecord = getHighScore(currentHeight, currentDiff);
    if (bestScoreEl) bestScoreEl.textContent = bestRecord ? `${bestRecord.score.toLocaleString()} ${t('result.pts')}` : '---';

    const saltLabel = modal.querySelector('#overlay-salt-label');
    if (saltLabel) saltLabel.textContent = t('settings.saltLabel');

    const saltInput = modal.querySelector('#overlay-salt-input');
    if (saltInput) saltInput.setAttribute('placeholder', t('settings.saltPlaceholder'));

    const loadSaltBtn = modal.querySelector('#overlay-load-salt-btn');
    if (loadSaltBtn) {
      loadSaltBtn.textContent = t('settings.loadBtn');
      loadSaltBtn.setAttribute('title', t('settings.loadBtn'));
    }

    const newSaltBtn = modal.querySelector('#overlay-new-salt-btn');
    if (newSaltBtn) {
      newSaltBtn.textContent = t('settings.reloadBtn');
      newSaltBtn.setAttribute('title', t('settings.reloadBtn'));
    }

    const startBtn = modal.querySelector('#start-game-btn');
    if (startBtn) startBtn.textContent = t('settings.startBtn');
  }

  /**
   * RTA設定モーダルのテキストを現在の言語辞書に合わせて差分更新
   */
  updateRTASettingsModalTexts() {
    if (!this.settingsModalEl) return;
    const modal = this.settingsModalEl;

    const titleEl = modal.querySelector('#rta-overlay-title');
    if (titleEl) titleEl.textContent = t('rta.title');

    const backBtn = modal.querySelector('#rta-back-normal-btn');
    if (backBtn) {
      backBtn.textContent = `◀ ${t('rta.backToNormalBtn')}`;
      backBtn.setAttribute('title', t('rta.backToNormalBtn'));
    }

    const modeLabel = modal.querySelector('#rta-mode-label');
    if (modeLabel) modeLabel.textContent = t('rta.modeLabel');

    const marathonText = modal.querySelector('#rta-radio-marathon-text');
    if (marathonText) marathonText.textContent = t('rta.marathon');

    const countupText = modal.querySelector('#rta-radio-countup-text');
    if (countupText) countupText.textContent = t('rta.countup');

    const heightLabel = modal.querySelector('#rta-height-label');
    if (heightLabel) heightLabel.textContent = t('rta.heightLabel');

    const heightText = modal.querySelector('#rta-height-text');
    if (heightText) heightText.textContent = t('hud.tiers', { n: this.selectedRtaHeight });

    const bestBadgeTitle = modal.querySelector('#rta-best-badge-title');
    if (bestBadgeTitle) bestBadgeTitle.textContent = `🏆 ${t('rta.bestRecord')}`;

    const bestRecordVal = modal.querySelector('#rta-best-record-val');
    if (bestRecordVal) {
      const rec = getRTARecord(this.selectedRtaMode, this.selectedRtaHeight);
      bestRecordVal.textContent = rec ? `${GameTimer.formatTime(rec.bestTotalTimeMs)} (${rec.bestScore.toLocaleString()} ${t('result.pts')})` : t('rta.noRecord');
    }

    const saltLabel = modal.querySelector('#rta-salt-label');
    if (saltLabel) saltLabel.textContent = t('settings.saltLabel');

    const saltInput = modal.querySelector('#rta-salt-input');
    if (saltInput) saltInput.setAttribute('placeholder', t('settings.saltPlaceholder'));

    const newSaltBtn = modal.querySelector('#rta-new-salt-btn');
    if (newSaltBtn) {
      newSaltBtn.textContent = t('settings.reloadBtn');
      newSaltBtn.setAttribute('title', t('settings.reloadBtn'));
    }

    const startRunBtn = modal.querySelector('#rta-start-run-btn');
    if (startRunBtn) startRunBtn.textContent = t('rta.startRunBtn');
  }

  /**
   * 設定・盤面保護モーダルの描画 (MVC: Controllerへのイベントディスパッチ)
   * @private
   * @param {import('../core/types.js').GameState} state
   * @param {boolean} isIdle
   */
  renderSettingsModal(state, isIdle) {
    if (this.isRTASettingsOpen) {
      this.renderRTASettingsModal(state, isIdle);
      return;
    }

    if (this.settingsModalEl && this.settingsModalEl.parentNode === this.container) {
      this.updateSettingsModalTexts(state);
      return;
    }

    const currentHeight = state.heightLimit;
    const currentDiff = state.difficultyLevel || 5;
    const bestRecord = getHighScore(currentHeight, currentDiff);
    const bestScoreStr = bestRecord ? `${bestRecord.score.toLocaleString()} ${t('result.pts')}` : '---';

    const overlayEl = document.createElement('div');
    overlayEl.className = 'start-overlay settings-modal-backdrop';
    overlayEl.innerHTML = `
      <div class="start-overlay-card settings-modal-card">
        <div class="overlay-card-header">
          <span class="shield-icon">⚙️</span>
          <div style="flex: 1;">
            <h3 class="start-overlay-title">${t('settings.title')}</h3>
          </div>
          <button id="overlay-open-rta-btn" class="btn btn-xs btn-rta-header" title="${t('rta.btn')}">
            ${t('rta.btn')}
          </button>
        </div>

        <div class="overlay-config-form">
          <!-- 段数スライダー -->
          <div class="form-row-col">
            <div class="diff-label-row">
              <span class="form-label" id="overlay-height-label">${t('settings.heightLabel')}</span>
              <strong class="height-level-text" id="overlay-height-text">${t('hud.tiers', { n: currentHeight })}</strong>
            </div>
            <div class="slider-wrapper">
              <span class="slider-end-label">3</span>
              <input type="range" id="overlay-height-slider" min="3" max="15" step="1" value="${currentHeight}" class="config-slider height-slider" />
              <span class="slider-end-label">15</span>
            </div>
          </div>

          <!-- 難易度スライダー & ハイスコア -->
          <div class="form-row-col">
            <div class="diff-label-row">
              <span class="form-label" id="overlay-diff-label">${t('settings.diffLabel')}</span>
              <span class="diff-level-text" id="overlay-diff-text">Lv ${currentDiff} ${t('difficulty.' + currentDiff)}</span>
            </div>
            <div class="slider-wrapper">
              <span class="slider-end-label">1</span>
              <input type="range" id="overlay-diff-slider" min="1" max="10" step="1" value="${currentDiff}" class="difficulty-slider" />
              <span class="slider-end-label">10</span>
            </div>
            <div class="highscore-preview-row">
              <div class="highscore-badge" id="overlay-best-badge">
                <span class="highscore-badge-title">🏆 (<span id="overlay-best-config">${t('hud.tiers', { n: currentHeight })} Lv${currentDiff}</span>):</span>
                <strong class="highscore-badge-value" id="overlay-best-score">${bestScoreStr}</strong>
              </div>
            </div>
          </div>

          <!-- ソルト設定 -->
          <div class="form-row-col salt-section">
            <div class="salt-label-row">
              <label for="overlay-salt-input" class="form-label" id="overlay-salt-label">${t('settings.saltLabel')}</label>
            </div>
            <div class="salt-input-group">
              <input type="text" id="overlay-salt-input" value="${state.salt || ''}" class="salt-input" placeholder="${t('settings.saltPlaceholder')}" />
              <button id="overlay-load-salt-btn" class="btn btn-xs btn-secondary" title="${t('settings.loadBtn')}">${t('settings.loadBtn')}</button>
              <button id="overlay-new-salt-btn" class="btn btn-xs btn-secondary" title="${t('settings.reloadBtn')}">${t('settings.reloadBtn')}</button>
            </div>
          </div>
        </div>

        <button class="btn btn-primary start-play-btn" id="start-game-btn">
          ${t('settings.startBtn')}
        </button>
      </div>
    `;

    // イベントバインド
    const heightSlider = overlayEl.querySelector('#overlay-height-slider');
    const heightText = overlayEl.querySelector('#overlay-height-text');
    const diffSlider = overlayEl.querySelector('#overlay-diff-slider');
    const diffText = overlayEl.querySelector('#overlay-diff-text');
    const bestScoreEl = overlayEl.querySelector('#overlay-best-score');
    const bestConfigEl = overlayEl.querySelector('#overlay-best-config');
    const saltInput = overlayEl.querySelector('#overlay-salt-input');
    const newSaltBtn = overlayEl.querySelector('#overlay-new-salt-btn');
    const loadSaltBtn = overlayEl.querySelector('#overlay-load-salt-btn');
    const startBtn = overlayEl.querySelector('#start-game-btn');
    const openRtaBtn = overlayEl.querySelector('#overlay-open-rta-btn');

    openRtaBtn?.addEventListener('click', () => {
      this.isRTASettingsOpen = true;
      this.removeSettingsModal();
      this.renderRTASettingsModal(state, isIdle);
    });

    const handleStartOrClose = () => {
      this.isSettingsOpen = false;
      this.isRTASettingsOpen = false;
      this.removeSettingsModal();

      // RTA走行中の場合は走破を中断して通常モードへ復帰
      if (this.engine.rtaState && this.engine.rtaState.active) {
        this.dispatchAction('abortRTARun');
      }

      // 最新のゲーム状態を確認: 待機時(idle)であればゲームを開始して盤面を表示
      const currentState = this.engine.getState();
      if (currentState.timerStatus === 'idle') {
        this.dispatchAction('startGame');
      } else {
        this.render(currentState);
      }
    };

    const updateHighScorePreview = (h, lvl) => {
      if (bestConfigEl) bestConfigEl.textContent = `${t('hud.tiers', { n: h })} Lv${lvl}`;
      const record = getHighScore(h, lvl);
      if (bestScoreEl) bestScoreEl.textContent = record ? `${record.score.toLocaleString()} ${t('result.pts')}` : '---';
    };

    // @ts-ignore
    diffSlider?.addEventListener('input', () => {
      // @ts-ignore
      const lvl = parseInt(diffSlider.value, 10);
      // @ts-ignore
      const h = parseInt(heightSlider?.value || String(this.engine.getState().heightLimit), 10);
      if (diffText) diffText.textContent = `Lv ${lvl} ${t('difficulty.' + lvl)}`;
      updateHighScorePreview(h, lvl);
    });

    // @ts-ignore
    diffSlider?.addEventListener('change', () => {
      // @ts-ignore
      const lvl = parseInt(diffSlider.value, 10);
      this.engine.setDifficultyLevel(lvl);
    });

    // @ts-ignore
    heightSlider?.addEventListener('input', () => {
      // @ts-ignore
      const h = parseInt(heightSlider.value, 10);
      // @ts-ignore
      const lvl = parseInt(diffSlider?.value || String(this.engine.getState().difficultyLevel || 5), 10);
      if (heightText) heightText.textContent = t('hud.tiers', { n: h });
      updateHighScorePreview(h, lvl);
    });

    // @ts-ignore
    heightSlider?.addEventListener('change', () => {
      // @ts-ignore
      const newH = parseInt(heightSlider.value, 10);
      this.dispatchAction('setHeightLimit', { height: newH });
      this.updateUrlParam(this.engine.getCurrentSalt());
    });

    newSaltBtn?.addEventListener('click', () => {
      this.dispatchAction('generateNewSalt');
      const newSalt = this.engine.getCurrentSalt();
      this.updateUrlParam(newSalt);
      // @ts-ignore
      if (saltInput) saltInput.value = newSalt;
    });

    const executeLoadSalt = () => {
      // @ts-ignore
      const val = saltInput?.value.trim();
      if (val) {
        this.dispatchAction('loadSalt', { salt: val });
        this.updateUrlParam(this.engine.getCurrentSalt());
      }
    };
    loadSaltBtn?.addEventListener('click', executeLoadSalt);
    saltInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        executeLoadSalt();
        // @ts-ignore
        saltInput?.blur();
      }
    });

    startBtn?.addEventListener('click', handleStartOrClose);

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl && !isIdle) {
        handleStartOrClose();
      }
    });

    this.settingsModalEl = overlayEl;
    this.container.appendChild(overlayEl);
  }

  /**
   * RTAモード設定モーダルの描画
   * @private
   * @param {import('../core/types.js').GameState} state
   * @param {boolean} isIdle
   */
  renderRTASettingsModal(state, isIdle) {
    if (this.settingsModalEl && this.settingsModalEl.parentNode === this.container) {
      this.updateRTASettingsModalTexts();
      return;
    }

    const overlayEl = document.createElement('div');
    overlayEl.className = 'start-overlay settings-modal-backdrop rta-settings-backdrop';

    const getRtaRecordText = () => {
      const rec = getRTARecord(this.selectedRtaMode, this.selectedRtaHeight);
      if (rec) {
        return `${GameTimer.formatTime(rec.bestTotalTimeMs)} (${rec.bestScore.toLocaleString()} ${t('result.pts')})`;
      }
      return t('rta.noRecord');
    };

    overlayEl.innerHTML = `
      <div class="start-overlay-card settings-modal-card rta-settings-card">
        <div class="overlay-card-header">
          <span class="shield-icon">🏃</span>
          <div style="flex: 1;">
            <h3 class="start-overlay-title" id="rta-overlay-title">${t('rta.title')}</h3>
          </div>
          <button id="rta-back-normal-btn" class="btn btn-xs btn-secondary" title="${t('rta.backToNormalBtn')}">
            ◀ ${t('rta.backToNormalBtn')}
          </button>
        </div>

        <div class="overlay-config-form">
          <!-- コース選択 -->
          <div class="form-row-col">
            <span class="form-label" id="rta-mode-label">${t('rta.modeLabel')}</span>
            <div class="rta-mode-selector">
              <label class="rta-radio-option ${this.selectedRtaMode === 'marathon' ? 'selected' : ''}">
                <input type="radio" name="rta-mode-radio" value="marathon" ${this.selectedRtaMode === 'marathon' ? 'checked' : ''} />
                <span class="rta-radio-text" id="rta-radio-marathon-text">${t('rta.marathon')}</span>
              </label>
              <label class="rta-radio-option ${this.selectedRtaMode === 'countup' ? 'selected' : ''}">
                <input type="radio" name="rta-mode-radio" value="countup" ${this.selectedRtaMode === 'countup' ? 'checked' : ''} />
                <span class="rta-radio-text" id="rta-radio-countup-text">${t('rta.countup')}</span>
              </label>
            </div>
          </div>

          <!-- カウントアップ時: 段数スライダー -->
          <div class="form-row-col ${this.selectedRtaMode === 'countup' ? '' : 'hidden'}" id="rta-height-section">
            <div class="diff-label-row">
              <span class="form-label" id="rta-height-label">${t('rta.heightLabel')}</span>
              <strong class="height-level-text" id="rta-height-text">${t('hud.tiers', { n: this.selectedRtaHeight })}</strong>
            </div>
            <div class="slider-wrapper">
              <span class="slider-end-label">3</span>
              <input type="range" id="rta-height-slider" min="3" max="15" step="1" value="${this.selectedRtaHeight}" class="config-slider height-slider" />
              <span class="slider-end-label">15</span>
            </div>
          </div>

          <!-- 自己ベスト記録バッジ -->
          <div class="highscore-preview-row">
            <div class="highscore-badge" id="rta-best-badge">
              <span class="highscore-badge-title" id="rta-best-badge-title">🏆 ${t('rta.bestRecord')}</span>
              <strong class="highscore-badge-value" id="rta-best-record-val">${getRtaRecordText()}</strong>
            </div>
          </div>

          <!-- ソルト設定 -->
          <div class="form-row-col salt-section">
            <div class="salt-label-row">
              <label for="rta-salt-input" class="form-label" id="rta-salt-label">${t('settings.saltLabel')}</label>
            </div>
            <div class="salt-input-group">
              <input type="text" id="rta-salt-input" value="${this.engine.getCurrentSalt() || ''}" class="salt-input" placeholder="${t('settings.saltPlaceholder')}" />
              <button id="rta-new-salt-btn" class="btn btn-xs btn-secondary" title="${t('settings.reloadBtn')}">${t('settings.reloadBtn')}</button>
            </div>
          </div>
        </div>

        <button class="btn btn-primary start-play-btn rta-start-btn" id="rta-start-run-btn">
          ${t('rta.startRunBtn')}
        </button>
      </div>
    `;

    // バインド
    const modeRadios = overlayEl.querySelectorAll('input[name="rta-mode-radio"]');
    const heightSection = overlayEl.querySelector('#rta-height-section');
    const heightSlider = overlayEl.querySelector('#rta-height-slider');
    const heightText = overlayEl.querySelector('#rta-height-text');
    const bestRecordVal = overlayEl.querySelector('#rta-best-record-val');
    const saltInput = overlayEl.querySelector('#rta-salt-input');
    const newSaltBtn = overlayEl.querySelector('#rta-new-salt-btn');
    const startRunBtn = overlayEl.querySelector('#rta-start-run-btn');
    const backBtn = overlayEl.querySelector('#rta-back-normal-btn');

    modeRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        // @ts-ignore
        this.selectedRtaMode = e.target.value;
        overlayEl.querySelectorAll('.rta-radio-option').forEach((opt) => {
          // @ts-ignore
          opt.classList.toggle('selected', opt.querySelector('input')?.value === this.selectedRtaMode);
        });

        if (heightSection) {
          heightSection.classList.toggle('hidden', this.selectedRtaMode !== 'countup');
        }
        if (bestRecordVal) {
          bestRecordVal.textContent = getRtaRecordText();
        }
      });
    });

    heightSlider?.addEventListener('input', () => {
      // @ts-ignore
      const h = parseInt(heightSlider.value, 10);
      this.selectedRtaHeight = h;
      if (heightText) heightText.textContent = t('hud.tiers', { n: h });
      if (bestRecordVal) bestRecordVal.textContent = getRtaRecordText();
    });

    newSaltBtn?.addEventListener('click', () => {
      const h = this.selectedRtaMode === 'marathon' ? 3 : this.selectedRtaHeight;
      const newSalt = generateRandomSalt(h);
      // @ts-ignore
      if (saltInput) saltInput.value = newSalt;
    });

    backBtn?.addEventListener('click', () => {
      this.isRTASettingsOpen = false;
      this.removeSettingsModal();
      this.renderSettingsModal(state, isIdle);
    });

    startRunBtn?.addEventListener('click', () => {
      // @ts-ignore
      const saltVal = saltInput?.value.trim() || '';
      this.isSettingsOpen = false;
      this.isRTASettingsOpen = false;
      this.removeSettingsModal();
      this.dispatchAction('startRTARun', {
        mode: this.selectedRtaMode,
        baseHeight: this.selectedRtaHeight,
        salt: saltVal
      });
    });

    this.settingsModalEl = overlayEl;
    this.container.appendChild(overlayEl);
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


  /**
   * 落下アニメーション対象のブロックIDを設定
   * @param {string | null} blockId
   */
  setDroppedBlock(blockId) {
    this.lastDroppedBlockId = blockId;
  }

  /**
   * ブロック要素の作成
   * @private
   * @param {import('../core/types.js').Block} block
   * @param {boolean} isTop
   * @param {boolean} isPickedUp
   * @param {boolean} [isScrambling=false]
   * @returns {HTMLElement}
   */
  createBlockElement(block, isTop, isPickedUp, isScrambling = false) {
    const el = document.createElement('div');
    el.className = `block block-${block.color.toLowerCase()}`;
    el.setAttribute('data-block-id', block.id);
    el.setAttribute('data-color', block.color);

    // 待機中または設定モーダル表示中の場合、初期配置特定を防ぐランダム波打ち＆色シフトアニメーションを適用
    if (isScrambling) {
      el.classList.add('idle-scrambling');
      const randomDelay = (Math.random() * -4).toFixed(2);
      const randomDur = (1.8 + Math.random() * 2.2).toFixed(2);
      const randomOffset = ((Math.random() - 0.5) * 50).toFixed(0);
      const randomHue = Math.floor(Math.random() * 360);
      el.style.setProperty('--scramble-delay', `${randomDelay}s`);
      el.style.setProperty('--scramble-dur', `${randomDur}s`);
      el.style.setProperty('--scramble-offset', `${randomOffset}px`);
      el.style.setProperty('--scramble-hue', `${randomHue}deg`);
    }

    // 新規着地ブロックに落下アニメーションを適用
    if (this.lastDroppedBlockId === block.id) {
      el.classList.add('block-dropping');
      el.addEventListener('animationend', () => {
        el.classList.remove('block-dropping');
        if (this.lastDroppedBlockId === block.id) {
          this.lastDroppedBlockId = null;
        }
      }, { once: true });
    }

    const config = ColorConfig[block.color];
    if (config) {
      el.style.background = config.gradient;
      // 最上位ブロックのみ美しい発光グローを付与
      if (isTop) {
        el.style.boxShadow = `0 3px 10px ${config.glow}`;
      }
    }

    // 最上位ブロックは常に操作可能 (最初から直接クリック＆ドラッグ可能)
    if (isTop) {
      el.setAttribute('data-is-top', 'true');
      el.setAttribute('draggable', 'true');
      el.title = t('app.moveTip');
    }

    if (isPickedUp) {
      el.classList.add('picked-up');
    }

    // ブロック内部ラベル (多言語対応: 1文字・頭文字表記)
    const label = document.createElement('span');
    label.className = 'block-label';
    const colorKey = `block.${block.color.toLowerCase()}`;
    label.textContent = t(colorKey);
    el.appendChild(label);

    return el;
  }
}

