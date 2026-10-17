// @ts-check
import { GameEngine } from './core/game_engine.js?v=2.8';
import { getSavedSettings } from './core/storage.js?v=2.8';
import { BoardRenderer } from './ui/renderer.js?v=2.8';
import { TimerAndControlView } from './ui/timer_view.js?v=2.8';
import { GameClearModal } from './ui/modal.js?v=2.8';
import { ClickInputController } from './controllers/click_controller.js?v=2.8';
import { DragDropInputController } from './controllers/drag_drop_controller.js?v=2.8';
import { TouchInputController } from './controllers/touch_controller.js?v=2.8';
import { KeyboardInputController } from './controllers/keyboard_controller.js?v=2.8';

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

  // 1. Cookieから前回設定を取得してコアエンジンのインスタンス化
  const savedSettings = getSavedSettings();
  const engine = new GameEngine(savedSettings.height);
  engine.setDifficultyLevel(savedSettings.difficultyLevel);

  // 2. URLクエリパラメータからソルト取得 (共有URL対応)
  const urlParams = new URLSearchParams(window.location.search);
  const initialSalt = urlParams.get('salt');
  if (initialSalt) {
    engine.loadFromSalt(initialSalt);
  }


  // 3. UIレンダラーとビューの初期化
  const renderer = new BoardRenderer(boardEl, engine);
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

  // 4. 入力コントローラー層の登録 (PC・スマホ双方の入力を完全サポート)
  new ClickInputController(engine, boardEl);
  new DragDropInputController(engine, boardEl);
  new TouchInputController(engine, boardEl);
  new KeyboardInputController(engine, (focusedIndex) => {
    renderer.setKeyboardFocus(focusedIndex);
  });

  // テスト・デバッグ用グローバル参照
  // @ts-ignore
  window.__ENGINE__ = engine;

  console.log('4Lane Block initialized successfully. Salt:', engine.getCurrentSalt());
}


// DOM読み込み完了時に起動
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
