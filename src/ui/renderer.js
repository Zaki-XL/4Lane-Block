// @ts-check
import { BlockColor, ColorConfig } from '../core/types.js';

/**
 * 盤面描画レンダラー
 * ブラウザの表示領域に合わせてブロックの高さを動的にスケーリングし、常に1画面に収める
 */
export class BoardRenderer {
  /**
   * @param {HTMLElement} containerElement - 盤面を描画する親コンテナ
   * @param {() => void} [onStart] - ゲーム開始リクエストコールバック
   */
  constructor(containerElement, onStart) {
    this.container = containerElement;
    this.onStart = onStart;
    this.focusedLaneIndex = 0;
    this.currentHeightLimit = 10;
    /** @type {string | null} */
    this.lastDroppedBlockId = null;

    // ウィンドウリサイズ時に動的スケーリングを再計算
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
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

    const headerH = header ? header.getBoundingClientRect().height : 60;
    const controlsH = controls ? controls.getBoundingClientRect().height : 140;
    const instructionsH = instructions ? instructions.getBoundingClientRect().height : 50;
    const appPadding = 24;
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
          const blockEl = this.createBlockElement(block, isTop, isSelected && isTop);
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

    // 開始前 (idle) の場合はぼかし解除用のスタートオーバーレイを表示
    if (isIdle) {
      const overlayEl = document.createElement('div');
      overlayEl.className = 'start-overlay';
      overlayEl.innerHTML = `
        <div class="start-overlay-card">
          <div class="start-overlay-icon">🔒</div>
          <h3 class="start-overlay-title">盤面保護中 (待機状態)</h3>
          <p class="start-overlay-desc">開始すると盤面がオープンされ、タイマー計測が始まります</p>
          <button class="btn btn-primary start-overlay-btn" id="start-overlay-btn">▶ ゲーム開始 (盤面を開く)</button>
        </div>
      `;

      // クリックでゲーム開始
      overlayEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onStart) {
          this.onStart();
        }
      });

      this.container.appendChild(overlayEl);
    }
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
   * @returns {HTMLElement}
   */
  createBlockElement(block, isTop, isPickedUp) {
    const el = document.createElement('div');
    el.className = `block block-${block.color.toLowerCase()}`;
    el.setAttribute('data-block-id', block.id);
    el.setAttribute('data-color', block.color);

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

    if (isTop) {
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
