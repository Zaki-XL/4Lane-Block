// @ts-check
import { GameEngine } from '../core/game_engine.js?v=3.7';

/**
 * モバイル・タッチ統合操作コントローラー
 * Pointer Events (down, move, up, cancel) を用い、
 * 1. 軽いタップでの持ち上げ (Pick) & 移動先タップ (Drop)
 * 2. 指で押してそのまま別レーンへスワイプする直感的なタッチドラッグ＆ドロップ (Touch Drag & Drop)
 * の双方を遅延なく確実に処理する
 */
export class TouchInputController {
  /**
   * @param {GameEngine} engine
   * @param {HTMLElement} containerElement
   */
  constructor(engine, containerElement) {
    this.engine = engine;
    this.container = containerElement;

    /** @type {number | null} 指でドラッグ開始した元のレーン番号 */
    this.touchFromIndex = null;
    /** @type {HTMLElement | null} ドラッグ中のブロック要素 */
    this.draggedBlockEl = null;
    /** @type {number} タップ判定用の開始X座標 */
    this.startX = 0;
    /** @type {number} タップ判定用の開始Y座標 */
    this.startY = 0;
    /** @type {number} タップ判定用の開始時刻 */
    this.startTime = 0;
    /** @type {boolean} 一定距離以上指を動かしてドラッグモードに入ったか */
    this.isDragging = false;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);

    this.attach();
  }

  attach() {
    this.container.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerCancel);
  }

  detach() {
    this.container.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerCancel);
  }

  /**
   * ポインター押下ハンドラ
   * @param {PointerEvent} event
   */
  handlePointerDown(event) {
    // マウス操作は ClickInputController および DragDropInputController が担当するため除外
    if (event.pointerType === 'mouse') return;

    const target = /** @type {HTMLElement} */ (event.target);
    const laneEl = target.closest('[data-lane-index]');
    if (!laneEl) return;

    const laneIndexStr = laneEl.getAttribute('data-lane-index');
    if (laneIndexStr === null) return;
    const laneIndex = parseInt(laneIndexStr, 10);

    this.startX = event.clientX;
    this.startY = event.clientY;
    this.startTime = Date.now();
    this.isDragging = false;
    this.touchFromIndex = laneIndex;

    // 最上位ブロックを押下しているか確認
    const blockEl = target.closest('[data-is-top="true"]');
    if (blockEl) {
      this.draggedBlockEl = /** @type {HTMLElement} */ (blockEl);
    } else {
      this.draggedBlockEl = null;
    }
  }

  /**
   * ポインター移動ハンドラ (スワイプドラッグ追随)
   * @param {PointerEvent} event
   */
  handlePointerMove(event) {
    if (this.touchFromIndex === null) return;

    const deltaX = Math.abs(event.clientX - this.startX);
    const deltaY = Math.abs(event.clientY - this.startY);

    // 10px以上動かしたらドラッグ開始とみなす
    if (!this.isDragging && (deltaX > 10 || deltaY > 10)) {
      if (this.draggedBlockEl) {
        this.isDragging = true;
        this.draggedBlockEl.classList.add('is-dragging');
      }
    }

    if (this.isDragging) {
      event.preventDefault(); // スクロール抑止

      // 指の下にある要素から目標レーンをリアルタイム検出
      const elementBelow = document.elementFromPoint(event.clientX, event.clientY);
      const targetLaneEl = elementBelow?.closest('[data-lane-index]');

      // 全レーンの drag-hover をクリアして現在レーンのみハイライト
      const allLanes = this.container.querySelectorAll('[data-lane-index]');
      allLanes.forEach((el) => {
        if (el === targetLaneEl) {
          el.classList.add('drag-hover');
        } else {
          el.classList.remove('drag-hover');
        }
      });
    }
  }

  /**
   * ポインター離脱ハンドラ (ドロップまたはタップ完了)
   * @param {PointerEvent} event
   */
  handlePointerUp(event) {
    if (this.touchFromIndex === null) return;

    const fromLane = this.touchFromIndex;
    const wasDragging = this.isDragging;

    // クリーンアップ
    if (this.draggedBlockEl) {
      this.draggedBlockEl.classList.remove('is-dragging');
    }
    const allLanes = this.container.querySelectorAll('[data-lane-index]');
    allLanes.forEach((el) => el.classList.remove('drag-hover'));

    this.touchFromIndex = null;
    this.draggedBlockEl = null;
    this.isDragging = false;

    if (wasDragging) {
      // 1. スワイプドラッグによるドロップ処理
      const elementBelow = document.elementFromPoint(event.clientX, event.clientY);
      const targetLaneEl = elementBelow?.closest('[data-lane-index]');
      if (targetLaneEl) {
        const toIndexStr = targetLaneEl.getAttribute('data-lane-index');
        if (toIndexStr !== null) {
          const toIndex = parseInt(toIndexStr, 10);
          this.engine.move(fromLane, toIndex);
        }
      }
    } else {
      // 2. 指をほとんど動かさずに離した場合 = タップ操作 (Pick or Drop)
      const elementBelow = document.elementFromPoint(event.clientX, event.clientY);
      const targetLaneEl = elementBelow?.closest('[data-lane-index]');
      if (targetLaneEl) {
        const toIndexStr = targetLaneEl.getAttribute('data-lane-index');
        if (toIndexStr !== null) {
          const clickedLane = parseInt(toIndexStr, 10);
          const state = this.engine.getState();
          if (state.selectedLaneIndex === null) {
            this.engine.pick(clickedLane);
          } else {
            this.engine.drop(clickedLane);
          }
        }
      }
    }
  }

  /**
   * ポインターキャンセルハンドラ
   */
  handlePointerCancel() {
    if (this.draggedBlockEl) {
      this.draggedBlockEl.classList.remove('is-dragging');
    }
    const allLanes = this.container.querySelectorAll('[data-lane-index]');
    allLanes.forEach((el) => el.classList.remove('drag-hover'));

    this.touchFromIndex = null;
    this.draggedBlockEl = null;
    this.isDragging = false;
  }
}
