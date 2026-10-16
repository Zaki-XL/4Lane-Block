// @ts-check
import { GameEngine } from '../core/game_engine.js';

/**
 * クリック / タップ操作コントローラー
 * 1回目クリックでレーン最上部ブロックを持ち上げ、2回目クリックで移動先へ配置する
 */
export class ClickInputController {
  /**
   * @param {GameEngine} engine
   * @param {HTMLElement} containerElement
   */
  constructor(engine, containerElement) {
    this.engine = engine;
    this.container = containerElement;
    this.handleClick = this.handleClick.bind(this);
    this.attach();
  }

  /**
   * イベントリスナーの登録
   */
  attach() {
    this.container.addEventListener('click', this.handleClick);
  }

  /**
   * イベントリスナーの解除
   */
  detach() {
    this.container.removeEventListener('click', this.handleClick);
  }

  /**
   * クリックイベントハンドラ
   * @param {MouseEvent} event
   */
  handleClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const laneEl = target.closest('[data-lane-index]');
    if (!laneEl) return;

    const laneIndexStr = laneEl.getAttribute('data-lane-index');
    if (laneIndexStr === null) return;
    const laneIndex = parseInt(laneIndexStr, 10);

    const state = this.engine.getState();

    // 既にブロックを持ち上げ中か判定
    if (state.selectedLaneIndex === null) {
      // 1手目: 持ち上げ (Pick)
      this.engine.pick(laneIndex);
    } else {
      // 2手目: 配置 (Drop) または 同一レーンクリックでキャンセル
      this.engine.drop(laneIndex);
    }
  }
}
