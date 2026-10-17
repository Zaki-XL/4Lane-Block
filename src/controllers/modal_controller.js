// @ts-check
import { GameEngine } from '../core/game_engine.js?v=3.9';
import { generateRandomSalt } from '../core/prng.js?v=3.9';
import { resetAllHighScores, resetAllRTARecords } from '../core/storage.js?v=3.9';

/**
 * モーダル画面（設定・リザルト・スコア一覧）からのユーザー操作を
 * ゲームエンジンおよびストレージモデルへ伝播するコントローラー (MVC: Controller)
 */
export class ModalActionController {
  /**
   * @param {GameEngine} engine
   * @param {import('../ui/renderer.js').BoardRenderer} renderer
   * @param {import('../ui/modal.js').GameClearModal} clearModal
   * @param {import('../ui/modal.js').ScoreListModal} scoreModal
   * @param {import('../ui/modal.js').RTAClearModal} [rtaClearModal]
   * @param {import('../ui/modal.js').RTAScoreListModal} [rtaScoreModal]
   */
  constructor(engine, renderer, clearModal, scoreModal, rtaClearModal, rtaScoreModal) {
    this.engine = engine;
    this.renderer = renderer;
    this.clearModal = clearModal;
    this.scoreModal = scoreModal;
    this.rtaClearModal = rtaClearModal;
    this.rtaScoreModal = rtaScoreModal;

    this.bindRendererEvents();
    this.bindClearModalEvents();
    this.bindScoreModalEvents();
    if (this.rtaClearModal) {
      this.bindRTAClearModalEvents();
    }
    if (this.rtaScoreModal) {
      this.bindRTAScoreModalEvents();
    }
  }

  /**
   * 設定モーダル（BoardRenderer）からのアクション購読
   */
  bindRendererEvents() {
    this.renderer.onAction = (action, payload) => {
      switch (action) {
        case 'setHeightLimit':
          this.engine.setHeightLimit(payload.height);
          break;
        case 'loadSalt':
          this.engine.loadFromSalt(payload.salt);
          break;
        case 'generateNewSalt': {
          const h = this.engine.getState().heightLimit;
          const newSalt = generateRandomSalt(h);
          this.engine.loadFromSalt(newSalt);
          break;
        }
        case 'startGame':
          this.engine.start();
          break;
        case 'startRTARun':
          this.engine.startRTARun(payload.mode, payload);
          break;
        case 'abortRTARun':
          this.engine.abortRTARun();
          break;
        default:
          break;
      }
    };
  }

  /**
   * クリアモーダルからのアクション購読
   */
  bindClearModalEvents() {
    this.clearModal.onAction = (action) => {
      switch (action) {
        case 'retry':
        case 'next':
          this.engine.reset();
          break;
        default:
          break;
      }
    };
  }

  /**
   * スコア一覧モーダルからのアクション購読
   */
  bindScoreModalEvents() {
    this.scoreModal.onAction = (action) => {
      switch (action) {
        case 'resetAll':
          resetAllHighScores();
          break;
        default:
          break;
      }
    };
  }

  /**
   * RTA走破完了リザルトモーダルからのアクション購読
   */
  bindRTAClearModalEvents() {
    if (!this.rtaClearModal) return;
    this.rtaClearModal.onAction = (action, payload) => {
      switch (action) {
        case 'retryRTARun':
          this.engine.startRTARun(this.engine.rtaState?.mode || 'marathon', {
            baseHeight: this.engine.rtaState?.baseHeight,
            salt: payload?.salt
          });
          break;
        case 'newRTARun':
          this.engine.startRTARun(this.engine.rtaState?.mode || 'marathon', {
            baseHeight: this.engine.rtaState?.baseHeight
          });
          break;
        case 'exitRTA':
          this.engine.abortRTARun();
          break;
        default:
          break;
      }
    };
  }

  /**
   * RTAハイスコア一覧モーダルからのアクション購読
   */
  bindRTAScoreModalEvents() {
    if (!this.rtaScoreModal) return;
    this.rtaScoreModal.onAction = (action) => {
      switch (action) {
        case 'resetAllRTA':
          resetAllRTARecords();
          break;
        default:
          break;
      }
    };
  }
}
