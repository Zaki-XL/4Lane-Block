// @ts-check
import { GameEngine } from '../core/game_engine.js';

/**
 * キーボード操作コントローラー
 * [1]-[4] キーや矢印キー・Enter/Space によるアクセシブルな操作を提供する
 */
export class KeyboardInputController {
  /**
   * @param {GameEngine} engine
   * @param {(focusedLane: number) => void} [onFocusChange]
   */
  constructor(engine, onFocusChange) {
    this.engine = engine;
    this.onFocusChange = onFocusChange;
    this.focusedLaneIndex = 0;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.attach();
  }

  attach() {
    window.addEventListener('keydown', this.handleKeyDown);
  }

  detach() {
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  /**
   * フォーカスされたレーンを変更
   * @param {number} newIndex
   */
  setFocus(newIndex) {
    if (newIndex < 0) newIndex = 3;
    if (newIndex > 3) newIndex = 0;
    this.focusedLaneIndex = newIndex;
    if (this.onFocusChange) {
      this.onFocusChange(this.focusedLaneIndex);
    }
  }

  /**
   * キーダウンイベントハンドラ
   * @param {KeyboardEvent} event
   */
  handleKeyDown(event) {
    // 入力フォームフォーカス中はスキップ
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      return;
    }

    const key = event.key;

    // [1] ~ [4] キーで直接レーン指定
    if (['1', '2', '3', '4'].includes(key)) {
      event.preventDefault();
      const laneIndex = parseInt(key, 10) - 1;
      this.setFocus(laneIndex);
      this.triggerLaneAction(laneIndex);
      return;
    }

    // 左右矢印 または A / D でフォーカス移動
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      event.preventDefault();
      this.setFocus(this.focusedLaneIndex - 1);
      return;
    }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      event.preventDefault();
      this.setFocus(this.focusedLaneIndex + 1);
      return;
    }

    // Enter または Space で決定 (Pick または Drop)
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      this.triggerLaneAction(this.focusedLaneIndex);
      return;
    }

    // Escape でキャンセル
    if (key === 'Escape') {
      event.preventDefault();
      this.engine.cancelPick();
      return;
    }
  }

  /**
   * 対象レーンに対して Pick または Drop を実行する
   * @private
   * @param {number} laneIndex
   */
  triggerLaneAction(laneIndex) {
    const state = this.engine.getState();
    if (state.selectedLaneIndex === null) {
      this.engine.pick(laneIndex);
    } else {
      this.engine.drop(laneIndex);
    }
  }
}
