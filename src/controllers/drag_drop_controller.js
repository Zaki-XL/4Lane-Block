// @ts-check
import { GameEngine } from '../core/game_engine.js';

/**
 * ドラッグ＆ドロップ操作コントローラー
 * HTML5 Drag & Drop API を用い、直感的に最上部ブロックをドラッグして別レーンへ配置する
 */
export class DragDropInputController {
  /**
   * @param {GameEngine} engine
   * @param {HTMLElement} containerElement
   */
  constructor(engine, containerElement) {
    this.engine = engine;
    this.container = containerElement;
    /** @type {number | null} */
    this.draggedFromIndex = null;

    this.handleDragStart = this.handleDragStart.bind(this);
    this.handleDragOver = this.handleDragOver.bind(this);
    this.handleDragEnter = this.handleDragEnter.bind(this);
    this.handleDragLeave = this.handleDragLeave.bind(this);
    this.handleDrop = this.handleDrop.bind(this);
    this.handleDragEnd = this.handleDragEnd.bind(this);

    this.attach();
  }

  attach() {
    this.container.addEventListener('dragstart', this.handleDragStart);
    this.container.addEventListener('dragover', this.handleDragOver);
    this.container.addEventListener('dragenter', this.handleDragEnter);
    this.container.addEventListener('dragleave', this.handleDragLeave);
    this.container.addEventListener('drop', this.handleDrop);
    this.container.addEventListener('dragend', this.handleDragEnd);
  }

  detach() {
    this.container.removeEventListener('dragstart', this.handleDragStart);
    this.container.removeEventListener('dragover', this.handleDragOver);
    this.container.removeEventListener('dragenter', this.handleDragEnter);
    this.container.removeEventListener('dragleave', this.handleDragLeave);
    this.container.removeEventListener('drop', this.handleDrop);
    this.container.removeEventListener('dragend', this.handleDragEnd);
  }

  /**
   * ドラッグ開始ハンドラ
   * @param {DragEvent} event
   */
  handleDragStart(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const blockEl = target.closest('[data-is-top="true"]');
    if (!blockEl || !event.dataTransfer) {
      event.preventDefault();
      return;
    }

    const laneEl = blockEl.closest('[data-lane-index]');
    if (!laneEl) return;

    const laneIndexStr = laneEl.getAttribute('data-lane-index');
    if (laneIndexStr === null) return;
    const laneIndex = parseInt(laneIndexStr, 10);

    this.draggedFromIndex = laneIndex;
    event.dataTransfer.setData('text/plain', String(laneIndex));
    event.dataTransfer.effectAllowed = 'move';
    blockEl.classList.add('is-dragging');
  }

  /**
   * ドラッグオーバーハンドラ（ドロップ受け入れ可否）
   * @param {DragEvent} event
   */
  handleDragOver(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const laneEl = target.closest('[data-lane-index]');
    if (!laneEl || !event.dataTransfer) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  /**
   * ドラッグ進入ハンドラ
   * @param {DragEvent} event
   */
  handleDragEnter(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const laneEl = target.closest('[data-lane-index]');
    if (laneEl) {
      laneEl.classList.add('drag-hover');
    }
  }

  /**
   * ドラッグ退出ハンドラ
   * @param {DragEvent} event
   */
  handleDragLeave(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const laneEl = target.closest('[data-lane-index]');
    if (laneEl && !laneEl.contains(/** @type {Node} */ (event.relatedTarget))) {
      laneEl.classList.remove('drag-hover');
    }
  }

  /**
   * ドロップハンドラ
   * @param {DragEvent} event
   */
  handleDrop(event) {
    event.preventDefault();
    const target = /** @type {HTMLElement} */ (event.target);
    const laneEl = target.closest('[data-lane-index]');
    if (!laneEl) return;

    laneEl.classList.remove('drag-hover');

    const toIndexStr = laneEl.getAttribute('data-lane-index');
    if (toIndexStr === null) return;
    const toIndex = parseInt(toIndexStr, 10);

    const fromIndexStr = event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
    const fromIndex = this.draggedFromIndex !== null
      ? this.draggedFromIndex
      : (fromIndexStr ? parseInt(fromIndexStr, 10) : null);

    if (fromIndex === null || isNaN(fromIndex)) return;

    // コアAPI経由でブロック移動
    this.engine.move(fromIndex, toIndex);
    this.draggedFromIndex = null;
  }

  /**
   * ドラッグ終了ハンドラ
   * @param {DragEvent} event
   */
  handleDragEnd(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    target.classList.remove('is-dragging');
    this.draggedFromIndex = null;
    const allLanes = this.container.querySelectorAll('[data-lane-index]');
    allLanes.forEach((el) => el.classList.remove('drag-hover'));
  }
}
