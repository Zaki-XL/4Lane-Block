// @ts-check
import { BlockColor, ColorConfig } from '../core/types.js';
import { generateRandomSalt } from '../core/prng.js';
import { DifficultyTitles, calculateTargets } from '../core/difficulty.js';
import { GameTimer } from '../core/timer.js';

/**
 * 盤面描画レンダラー
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
    /** @type {string | null} */
    this.lastDroppedBlockId = null;

    // ゲームクリア時の演出購読
    this.engine.on('gameClear', () => {
      this.triggerVictoryWave();
    });

    // ウィンドウリサイズ時に動的スケーリングを再計算
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
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
   * リサイズイベントハンドラ
   */
  handleResize() {
    this.updateViewportFit(this.currentHeightLimit);
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
   * 盤面の最新状態を描画する
   * @param {import('../core/types.js').GameState} state
   */
  render(state) {
    this.updateViewportFit(state.heightLimit);
    this.container.innerHTML = '';

    const isIdle = state.timerStatus === 'idle';

    // 4レーンを内包するラッパー
    const lanesWrapper = document.createElement('div');
    lanesWrapper.className = `lanes-wrapper ${isIdle ? 'board-blurred' : ''}`;

    for (let laneIdx = 0; laneIdx < 4; laneIdx++) {
      const lane = state.lanes[laneIdx];
      const isSelected = state.selectedLaneIndex === laneIdx;
      const isFocused = this.focusedLaneIndex === laneIdx;

      const laneEl = document.createElement('div');
      laneEl.className = 'lane';
      laneEl.setAttribute('data-lane-index', String(laneIdx));
      if (isSelected) laneEl.classList.add('lane-selected');
      if (isFocused) laneEl.classList.add('keyboard-focused');

      // レーン番号および容量ヘッダー ([1] L1 と 3/10 を表示)
      const headerEl = document.createElement('div');
      headerEl.className = 'lane-header';
      headerEl.innerHTML = `<span class="lane-num">[${laneIdx + 1}] L${laneIdx + 1}</span><span class="lane-cap">${lane.length}/${state.heightLimit}</span>`;
      laneEl.appendChild(headerEl);

      // スロットコンテナ (下から上へ積み上げる)
      const slotsContainer = document.createElement('div');
      slotsContainer.className = 'slots-container';

      // 高さ上限分のスロットを作成 (下から順に 0 ~ heightLimit-1)
      for (let slotIdx = state.heightLimit - 1; slotIdx >= 0; slotIdx--) {
        const slotEl = document.createElement('div');
        slotEl.className = 'slot';

        const block = lane[slotIdx];
        if (block) {
          const isTop = slotIdx === lane.length - 1;
          const blockEl = this.createBlockElement(block, isTop, isSelected && isTop, isIdle);
          slotEl.appendChild(blockEl);
        } else {
          slotEl.classList.add('slot-empty');
        }

        slotsContainer.appendChild(slotEl);
      }

      laneEl.appendChild(slotsContainer);

      // レーン底面ベース
      const baseEl = document.createElement('div');
      baseEl.className = 'lane-base';
      laneEl.appendChild(baseEl);

      lanesWrapper.appendChild(laneEl);
    }

    this.container.appendChild(lanesWrapper);

    // 開始前 (idle) の場合は設定コンソール付きのスタートオーバーレイを表示
    if (isIdle) {
      this.renderStartOverlay(state);
    }
  }

  /**
   * 待機中設定オーバーレイの描画
   * @private
   * @param {import('../core/types.js').GameState} state
   */
  renderStartOverlay(state) {
    const currentHeight = state.heightLimit;
    const currentDiff = state.difficultyLevel || 5;
    const targets = calculateTargets(currentHeight, currentDiff);

    const overlayEl = document.createElement('div');
    overlayEl.className = 'start-overlay';
    overlayEl.innerHTML = `
      <div class="start-overlay-card">
        <div class="overlay-card-header">
          <span class="shield-icon">🛡️</span>
          <div>
            <h3 class="start-overlay-title">盤面保護中・ゲーム設定</h3>
            <p class="start-overlay-desc">開始すると盤面がオープンし、タイマー計測が始まります</p>
          </div>
        </div>

        <div class="overlay-config-form">
          <!-- 段数選択 -->
          <div class="form-row">
            <label for="overlay-height-select" class="form-label">レーン段数:</label>
            <div class="form-field">
              <select id="overlay-height-select" class="config-select">
                ${Array.from({ length: 13 }, (_, i) => i + 3).map(h => `
                  <option value="${h}" ${h === currentHeight ? 'selected' : ''}>${h} 段</option>
                `).join('')}
              </select>
            </div>
          </div>

          <!-- 難易度スライダー -->
          <div class="form-row-col">
            <div class="diff-label-row">
              <span class="form-label">難易度:</span>
              <span class="diff-level-text" id="overlay-diff-text">Lv ${currentDiff} ${DifficultyTitles[currentDiff]}</span>
              <span class="diff-speed-text" id="overlay-speed-text">(${targets.secPerMove}s/手)</span>
            </div>
            <div class="slider-wrapper">
              <span class="slider-end-label">1 易</span>
              <input type="range" id="overlay-diff-slider" min="1" max="10" step="1" value="${currentDiff}" class="difficulty-slider" />
              <span class="slider-end-label">10 難</span>
            </div>
          </div>

          <!-- 目標プレビュー -->
          <div class="overlay-targets-banner" id="overlay-targets-banner">
            🎯 目標手数: <strong id="overlay-target-moves">${targets.targetMoves} 手</strong> / 目標タイム: <strong id="overlay-target-time">${GameTimer.formatTime(targets.targetTimeMs)}</strong>
          </div>

          <!-- ソルト設定 -->
          <div class="form-row-col salt-section">
            <div class="salt-label-row">
              <label for="overlay-salt-input" class="form-label">盤面ソルト (シード):</label>
              <button id="overlay-new-salt-btn" class="btn btn-xs btn-secondary" title="現在の段数で新しい盤面を生成">🎲 新規生成</button>
            </div>
            <div class="salt-input-group">
              <input type="text" id="overlay-salt-input" value="${state.salt || ''}" class="salt-input" placeholder="ソルトを入力..." />
              <button id="overlay-load-salt-btn" class="btn btn-xs btn-secondary" title="入力したソルトをロード">読込</button>
              <button id="overlay-copy-salt-btn" class="btn btn-xs btn-outline" title="共有URLをコピー">共有URL</button>
            </div>
          </div>
        </div>

        <button class="btn btn-primary start-play-btn" id="start-game-btn">
          ▶ ゲーム開始 (盤面を開く)
        </button>
      </div>
    `;

    // イベントバインド
    const heightSelect = overlayEl.querySelector('#overlay-height-select');
    const diffSlider = overlayEl.querySelector('#overlay-diff-slider');
    const diffText = overlayEl.querySelector('#overlay-diff-text');
    const speedText = overlayEl.querySelector('#overlay-speed-text');
    const targetMovesEl = overlayEl.querySelector('#overlay-target-moves');
    const targetTimeEl = overlayEl.querySelector('#overlay-target-time');
    const saltInput = overlayEl.querySelector('#overlay-salt-input');
    const newSaltBtn = overlayEl.querySelector('#overlay-new-salt-btn');
    const loadSaltBtn = overlayEl.querySelector('#overlay-load-salt-btn');
    const copySaltBtn = overlayEl.querySelector('#overlay-copy-salt-btn');
    const startBtn = overlayEl.querySelector('#start-game-btn');

    // 難易度スライダー連動
    // @ts-ignore
    diffSlider?.addEventListener('input', () => {
      // @ts-ignore
      const lvl = parseInt(diffSlider.value, 10);
      this.engine.setDifficultyLevel(lvl);
      const h = this.engine.getState().heightLimit;
      const t = calculateTargets(h, lvl);
      if (diffText) diffText.textContent = `Lv ${lvl} ${DifficultyTitles[lvl]}`;
      if (speedText) speedText.textContent = `(${t.secPerMove}s/手)`;
      if (targetMovesEl) targetMovesEl.textContent = `${t.targetMoves} 手`;
      if (targetTimeEl) targetTimeEl.textContent = GameTimer.formatTime(t.targetTimeMs);
    });

    // 段数セレクト連動
    heightSelect?.addEventListener('change', () => {
      // @ts-ignore
      const newH = parseInt(heightSelect.value, 10);
      this.engine.setHeightLimit(newH);
      this.updateUrlParam(this.engine.getCurrentSalt());
    });

    // 新規ソルト生成
    newSaltBtn?.addEventListener('click', () => {
      const h = this.engine.getState().heightLimit;
      const newSalt = generateRandomSalt(h);
      this.engine.loadFromSalt(newSalt);
      this.updateUrlParam(newSalt);
    });

    // ソルトロード
    const executeLoadSalt = () => {
      // @ts-ignore
      const val = saltInput?.value.trim();
      if (val) {
        this.engine.loadFromSalt(val);
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

    // 共有URLコピー
    copySaltBtn?.addEventListener('click', async () => {
      const curSalt = this.engine.getCurrentSalt();
      const shareUrl = `${window.location.origin}${window.location.pathname}?salt=${encodeURIComponent(curSalt)}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        if (copySaltBtn) {
          const org = copySaltBtn.textContent;
          copySaltBtn.textContent = 'コピー済!';
          setTimeout(() => { if (copySaltBtn) copySaltBtn.textContent = org; }, 1500);
        }
      } catch (err) {
        prompt('このURLを共有してください:', shareUrl);
      }
    });

    // ゲーム開始ボタン
    startBtn?.addEventListener('click', () => {
      this.engine.start();
    });

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
   * @param {boolean} [isIdle=false]
   * @returns {HTMLElement}
   */
  createBlockElement(block, isTop, isPickedUp, isIdle = false) {
    const el = document.createElement('div');
    el.className = `block block-${block.color.toLowerCase()}`;
    el.setAttribute('data-block-id', block.id);
    el.setAttribute('data-color', block.color);

    // 待機中 (idle) の場合、初期配置特定を防ぐランダム波打ち＆色シフトアニメーションを適用
    if (isIdle) {
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

    if (isTop && !isIdle) {
      el.setAttribute('data-is-top', 'true');
      el.setAttribute('draggable', 'true');
      el.title = 'ドラッグまたはクリックして移動';
    }

    if (isPickedUp) {
      el.classList.add('picked-up');
    }

    // ブロック内部ラベル
    const label = document.createElement('span');
    label.className = 'block-label';
    label.textContent = config ? config.name : block.color;
    el.appendChild(label);

    return el;
  }
}

