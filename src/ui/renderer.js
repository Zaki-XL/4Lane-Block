// @ts-check
import { BlockColor, ColorConfig } from '../core/types.js';

/**
 * 盤面描画レンダラー
 * ブラウザの表示領域に合わせてブロックの高さを動的にスケーリングし、常に1画面に収める
 */
export class BoardRenderer {
  /**
   * @param {HTMLElement} containerElement - 盤面を描画する親コンテナ
   */
  constructor(containerElement) {
    this.container = containerElement;
    this.focusedLaneIndex = 0;
    this.currentHeightLimit = 10;

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

    // ヘッダーやコントロールパネル、操作説明、余白の総高さを動的に取得
    const header = document.querySelector('.header');
    const controls = document.querySelector('#controls');
    const instructions = document.querySelector('.instructions-panel');

    const headerH = header ? header.getBoundingClientRect().height : 60;
    const controlsH = controls ? controls.getBoundingClientRect().height : 120;
    const instructionsH = instructions ? instructions.getBoundingClientRect().height : 50;
    const appPadding = 32; // 上下マージン・パディング
    const laneHeaderBaseH = 48; // 各レーンの番号ヘッダー(24px) + 底面ベース(10px) + 余白

    const windowH = window.innerHeight;
    const overhead = headerH + controlsH + instructionsH + appPadding + laneHeaderBaseH;

    // レーンのスロットエリアに利用可能な最大縦幅
    const availableH = Math.max(100, windowH - overhead);

    // スロット間ギャップ (4px) を考慮した1スロットあたりの高さ
    const gapTotal = (heightLimit - 1) * 4;
    const rawSlotH = Math.floor((availableH - gapTotal) / heightLimit);

    // 最小16px、最大52pxの範囲にクランプ
    const optimalSlotH = Math.max(16, Math.min(52, rawSlotH));
    const optimalFontSize = Math.max(9, Math.min(14, Math.floor(optimalSlotH * 0.42)));

    // ルート要素またはコンテナへCSS変数を設定
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
    // 描画前に1画面フィット計算を実行
    this.updateViewportFit(state.heightLimit);

    this.container.innerHTML = '';

    for (let laneIdx = 0; laneIdx < 4; laneIdx++) {
      const lane = state.lanes[laneIdx];
      const isSelected = state.selectedLaneIndex === laneIdx;
      const isFocused = this.focusedLaneIndex === laneIdx;

      const laneEl = document.createElement('div');
      laneEl.className = 'lane';
      laneEl.setAttribute('data-lane-index', String(laneIdx));
      if (isSelected) laneEl.classList.add('lane-selected');
      if (isFocused) laneEl.classList.add('keyboard-focused');

      // レーン番号ヘッダー
      const headerEl = document.createElement('div');
      headerEl.className = 'lane-header';
      headerEl.innerHTML = `<span class="lane-num">[${laneIdx + 1}]</span> L${laneIdx + 1}`;
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

      this.container.appendChild(laneEl);
    }
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

    const config = ColorConfig[block.color];
    if (config) {
      el.style.background = config.gradient;
      el.style.boxShadow = `0 2px 8px ${config.glow}`;
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
