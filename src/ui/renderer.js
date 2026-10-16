// @ts-check
import { BlockColor, ColorConfig } from '../core/types.js';

/**
 * 盤面描画レンダラー
 * 4つのレーンとブロックのスタック状態をDOMへ反映する
 */
export class BoardRenderer {
  /**
   * @param {HTMLElement} containerElement - 盤面を描画する親コンテナ
   */
  constructor(containerElement) {
    this.container = containerElement;
    this.focusedLaneIndex = 0;
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
      headerEl.innerHTML = `<span class="lane-num">[${laneIdx + 1}]</span> レーン ${laneIdx + 1}`;
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
      el.style.boxShadow = `0 4px 12px ${config.glow}`;
    }

    if (isTop) {
      el.setAttribute('data-is-top', 'true');
      el.setAttribute('draggable', 'true');
      el.title = 'ドラッグまたはクリックして移動';
    }

    if (isPickedUp) {
      el.classList.add('picked-up');
    }

    // ブロック内部の光沢とラベル
    const label = document.createElement('span');
    label.className = 'block-label';
    label.textContent = config ? config.name : block.color;
    el.appendChild(label);

    return el;
  }
}
