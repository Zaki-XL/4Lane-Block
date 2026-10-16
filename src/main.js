// @ts-check
import { GameEngine } from './core/game_engine.js';
import { BoardRenderer } from './ui/renderer.js';
import { TimerAndControlView } from './ui/timer_view.js';
import { GameClearModal } from './ui/modal.js';
import { ClickInputController } from './controllers/click_controller.js';
import { DragDropInputController } from './controllers/drag_drop_controller.js';
import { KeyboardInputController } from './controllers/keyboard_controller.js';

/**
 * アプリケーションの初期化
 */
function initApp() {
  const boardEl = document.getElementById('board');
  const controlEl = document.getElementById('controls');
  const modalContainerEl = document.getElementById('modal-container');

  if (!boardEl || !controlEl || !modalContainerEl) {
    console.error('必要なDOM要素が見つかりません');
    return;
  }

  // 1. コアエンジンのインスタンス化 (デフォルト高さ: 10)
  const engine = new GameEngine(10);

  // 2. URLクエリパラメータからソルト取得 (共有URL対応)
  const urlParams = new URLSearchParams(window.location.search);
  const initialSalt = urlParams.get('salt');
  if (initialSalt) {
    engine.loadFromSalt(initialSalt);
  }

  // 3. UIレンダラーとビューの初期化
  const renderer = new BoardRenderer(boardEl);
  new TimerAndControlView(engine, controlEl);
  new GameClearModal(engine, modalContainerEl);

  // 初回描画
  renderer.render(engine.getState());

  // 移動成功時に落下アニメーション対象ブロックを設定
  engine.on('moveSuccess', ({ block }) => {
    renderer.setDroppedBlock(block.id);
  });

  // 状態変化時の再描画購読
  engine.on('stateChange', (state) => {
    renderer.render(state);
  });

  // 4. 入力コントローラー層の登録 (API経由で統一操作)
  new ClickInputController(engine, boardEl);
  new DragDropInputController(engine, boardEl);
  new KeyboardInputController(engine, (focusedIndex) => {
    renderer.setKeyboardFocus(focusedIndex);
  });

  console.log('4Lane Block initialized successfully. Salt:', engine.getCurrentSalt());
}

// DOM読み込み完了時に起動
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
