// @ts-check
import { GameEngine } from './core/game_engine.js?v=3.9';
import { getSavedSettings } from './core/storage.js?v=3.9';
import { BoardRenderer } from './ui/renderer.js?v=3.9';
import { TimerAndControlView } from './ui/timer_view.js?v=3.9';
import { GameClearModal, ScoreListModal, HelpModal, RTAClearModal, RTAScoreListModal } from './ui/modal.js?v=3.9';
import { ClickInputController } from './controllers/click_controller.js?v=3.9';
import { DragDropInputController } from './controllers/drag_drop_controller.js?v=3.9';
import { TouchInputController } from './controllers/touch_controller.js?v=3.9';
import { KeyboardInputController } from './controllers/keyboard_controller.js?v=3.9';
import { ModalActionController } from './controllers/modal_controller.js?v=3.9';
import { t, i18n } from './i18n/index.js?v=3.9';

/**
 * 静的DOM要素（ヘッダー・フッター等）の多言語テキスト更新
 */
function updateStaticElements() {
  const headerLangSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('header-lang-select'));
  if (headerLangSelect) {
    headerLangSelect.value = i18n.getLanguage();
  }

  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) {
    helpBtn.textContent = t('app.helpBtn');
    helpBtn.title = t('help.title');
  }
  const footerTitle = document.getElementById('footer-title');
  if (footerTitle) footerTitle.textContent = t('footer.title');

  const footerTap = document.getElementById('footer-tap');
  if (footerTap) footerTap.innerHTML = `<strong>${t('footer.tapLabel')}</strong> ${t('footer.tapDesc')}`;

  const footerDrag = document.getElementById('footer-drag');
  if (footerDrag) footerDrag.innerHTML = `<strong>${t('footer.dragLabel')}</strong> ${t('footer.dragDesc')}`;

  const footerKeys = document.getElementById('footer-keys');
  if (footerKeys) {
    footerKeys.innerHTML = `<strong>${t('footer.keysLabel')}</strong> <span class="key-badge">1</span>〜<span class="key-badge">4</span>、<span class="key-badge">←</span><span class="key-badge">→</span> + <span class="key-badge">Enter</span>、<span class="key-badge">Esc</span>`;
  }
}

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

  // 静的テキストの初期反映
  updateStaticElements();
  i18n.onLanguageChange(updateStaticElements);

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
  const clearModal = new GameClearModal(engine, modalContainerEl);
  const scoreModal = new ScoreListModal(engine, modalContainerEl);
  const rtaClearModal = new RTAClearModal(engine, modalContainerEl);
  const rtaScoreModal = new RTAScoreListModal(engine, modalContainerEl);
  new HelpModal(engine, modalContainerEl);

  // ヘッダーの言語セレクタ連携
  const headerLangSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('header-lang-select'));
  if (headerLangSelect) {
    headerLangSelect.value = i18n.getLanguage();
    headerLangSelect.addEventListener('change', (e) => {
      // @ts-ignore
      i18n.setLanguage(e.target.value);
    });
  }

  // ヘッダーのヘルプボタン連携
  const helpBtn = document.getElementById('help-btn');
  helpBtn?.addEventListener('click', () => {
    engine.emit('requestOpenHelp');
  });

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

  // 4. 入力・モーダルコントローラー層の登録 (MVC: Controller)
  new ClickInputController(engine, boardEl);
  new DragDropInputController(engine, boardEl);
  new TouchInputController(engine, boardEl);
  new KeyboardInputController(engine, (focusedIndex) => {
    renderer.setKeyboardFocus(focusedIndex);
  });
  new ModalActionController(engine, renderer, clearModal, scoreModal, rtaClearModal, rtaScoreModal);

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
