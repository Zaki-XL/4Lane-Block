// @ts-check
import { t, i18n } from '../i18n/index.js';

/**
 * SNSシェア押下時の「Xに遷移します」アナウンスモーダルクラス (差分DOM更新 & メモリ最適化版)
 */
export class ShareNoticeModal {
  constructor() {
    /** @type {HTMLDivElement | null} */
    this.modalEl = null;
    /** @type {{ blob: Blob, filename: string, tweetUrl: string, copied: boolean, showToast?: (msg: string) => void } | null} */
    this.currentData = null;

    // キャッシュするDOM要素群
    /** @type {HTMLElement | null} */
    this.titleEl = null;
    /** @type {HTMLButtonElement | null} */
    this.closeBtnEl = null;
    /** @type {HTMLElement | null} */
    this.statusBoxEl = null;
    /** @type {HTMLElement | null} */
    this.statusIconEl = null;
    /** @type {HTMLElement | null} */
    this.statusTitleEl = null;
    /** @type {HTMLElement | null} */
    this.statusDescEl = null;
    /** @type {HTMLElement | null} */
    this.step1CardEl = null;
    /** @type {HTMLElement | null} */
    this.step1TitleEl = null;
    /** @type {HTMLElement | null} */
    this.step1DescEl = null;
    /** @type {HTMLElement | null} */
    this.step1CheckEl = null;
    /** @type {HTMLElement | null} */
    this.step2TitleEl = null;
    /** @type {HTMLElement | null} */
    this.step2DescEl = null;
    /** @type {HTMLElement | null} */
    this.openXLabelEl = null;
    /** @type {HTMLElement | null} */
    this.downloadLabelEl = null;
    /** @type {HTMLElement | null} */
    this.cancelLabelEl = null;

    this.render();
    this.bindEvents();

    i18n.onLanguageChange(() => {
      this.updateTexts();
    });
  }

  render() {
    let el = document.getElementById('share-notice-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'share-notice-modal';
      el.className = 'modal-backdrop share-notice-backdrop hidden';
      const container = document.getElementById('modal-container') || document.body;
      container.appendChild(el);
    }
    this.modalEl = /** @type {HTMLDivElement} */ (el);

    // 初回のみ静的HTML骨格を生成
    this.modalEl.innerHTML = `
      <div class="modal-card share-notice-card" role="dialog" aria-modal="true" aria-labelledby="sn-title">
        <div class="share-notice-header">
          <div class="share-notice-icon-wrapper">
            <span class="share-notice-brand-icon">𝕏</span>
          </div>
          <div class="share-notice-header-text">
            <h3 class="share-notice-title" id="sn-title">${t('shareNotice.title')}</h3>
          </div>
          <button id="share-notice-close-btn" class="modal-close-icon-btn" title="${t('shareNotice.closeBtn')}" aria-label="${t('shareNotice.closeBtn')}">✕</button>
        </div>

        <div class="share-notice-status status-success" id="sn-status-box">
          <span class="status-icon" id="sn-status-icon">✅</span>
          <div class="status-text-group">
            <div class="status-title" id="sn-status-title">${t('shareNotice.copiedSuccessTitle')}</div>
            <div class="status-desc" id="sn-status-desc">${t('shareNotice.copiedSuccessDesc')}</div>
          </div>
        </div>

        <div class="share-steps-container">
          <div class="share-step-card step-completed" id="sn-step1-card">
            <div class="step-num-badge">1</div>
            <div class="step-content">
              <div class="step-title" id="sn-step1-title">${t('shareNotice.step1Title')}</div>
              <div class="step-sub" id="sn-step1-desc">${t('shareNotice.step1Desc')}</div>
            </div>
            <div class="step-check" id="sn-step1-check">✓</div>
          </div>
          <div class="share-step-arrow" aria-hidden="true">➡️</div>
          <div class="share-step-card step-action" id="sn-step2-card">
            <div class="step-num-badge">2</div>
            <div class="step-content">
              <div class="step-title" id="sn-step2-title">${t('shareNotice.step2Title')}</div>
              <div class="step-sub" id="sn-step2-desc">${t('shareNotice.step2Desc')}</div>
            </div>
          </div>
        </div>

        <!-- ポップアップブロック検知時のフォールバックUI -->
        <div class="share-blocked-box hidden" id="sn-blocked-box">
          <div class="share-blocked-header">
            <span class="share-blocked-icon">⚠️</span>
            <div class="share-blocked-title" id="sn-blocked-title">${t('shareNotice.popupBlockedTitle')}</div>
          </div>
          <div class="share-blocked-desc" id="sn-blocked-desc">${t('shareNotice.popupBlockedDesc')}</div>
          <div class="share-fallback-actions">
            <a id="sn-fallback-direct-link" class="btn btn-share btn-sm" target="_blank" rel="noopener noreferrer">
              <span class="btn-share-icon">𝕏</span>
              <span id="sn-direct-link-label">${t('shareNotice.directLinkBtn')}</span>
            </a>
            <button id="sn-fallback-sametab-btn" class="btn btn-outline btn-sm">
              <span id="sn-sametab-label">${t('shareNotice.sameTabBtn')}</span>
            </button>
            <button id="sn-fallback-copy-url-btn" class="btn btn-secondary btn-sm">
              <span id="sn-copy-url-label">${t('shareNotice.copyUrlBtn')}</span>
            </button>
          </div>
        </div>

        <div class="share-notice-actions">
          <button id="share-notice-open-x-btn" class="btn btn-share btn-block">
            <span class="btn-share-icon">𝕏</span>
            <span id="sn-open-x-label">${t('shareNotice.openXBtn')}</span>
          </button>
          <div class="share-notice-sub-actions">
            <button id="share-notice-download-btn" class="btn btn-outline btn-sm">
              <span id="sn-download-label">${t('shareNotice.saveImgBtn')}</span>
            </button>
            <button id="share-notice-cancel-btn" class="btn btn-secondary btn-sm">
              <span id="sn-cancel-label">${t('shareNotice.closeBtn')}</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // DOM要素参照をキャッシュ (リフロー抑制)
    this.titleEl = this.modalEl.querySelector('#sn-title');
    this.closeBtnEl = this.modalEl.querySelector('#share-notice-close-btn');
    this.statusBoxEl = this.modalEl.querySelector('#sn-status-box');
    this.statusIconEl = this.modalEl.querySelector('#sn-status-icon');
    this.statusTitleEl = this.modalEl.querySelector('#sn-status-title');
    this.statusDescEl = this.modalEl.querySelector('#sn-status-desc');
    this.step1CardEl = this.modalEl.querySelector('#sn-step1-card');
    this.step1TitleEl = this.modalEl.querySelector('#sn-step1-title');
    this.step1DescEl = this.modalEl.querySelector('#sn-step1-desc');
    this.step1CheckEl = this.modalEl.querySelector('#sn-step1-check');
    this.step2TitleEl = this.modalEl.querySelector('#sn-step2-title');
    this.step2DescEl = this.modalEl.querySelector('#sn-step2-desc');
    this.openXLabelEl = this.modalEl.querySelector('#sn-open-x-label');
    this.downloadLabelEl = this.modalEl.querySelector('#sn-download-label');
    this.cancelLabelEl = this.modalEl.querySelector('#sn-cancel-label');
    // フォールバック関連要素
    this.blockedBoxEl = this.modalEl.querySelector('#sn-blocked-box');
    this.blockedTitleEl = this.modalEl.querySelector('#sn-blocked-title');
    this.blockedDescEl = this.modalEl.querySelector('#sn-blocked-desc');
    this.fallbackDirectLinkEl = /** @type {HTMLAnchorElement | null} */ (this.modalEl.querySelector('#sn-fallback-direct-link'));
    this.directLinkLabelEl = this.modalEl.querySelector('#sn-direct-link-label');
    this.sameTabBtnEl = this.modalEl.querySelector('#sn-fallback-sametab-btn');
    this.sameTabLabelEl = this.modalEl.querySelector('#sn-sametab-label');
    this.copyUrlBtnEl = this.modalEl.querySelector('#sn-fallback-copy-url-btn');
    this.copyUrlLabelEl = this.modalEl.querySelector('#sn-copy-url-label');
  }

  /**
   * DOM破棄を伴わない高速差分更新 (Layout Thrashing 抑制)
   */
  updateContent() {
    if (!this.modalEl) return;
    const copied = this.currentData ? this.currentData.copied : true;

    // タイトル ＆ ヘッダー
    if (this.titleEl) this.titleEl.textContent = t('shareNotice.title');
    if (this.closeBtnEl) {
      this.closeBtnEl.title = t('shareNotice.closeBtn');
      this.closeBtnEl.setAttribute('aria-label', t('shareNotice.closeBtn'));
    }

    // ステータスボックス
    if (this.statusBoxEl) {
      this.statusBoxEl.className = `share-notice-status ${copied ? 'status-success' : 'status-warn'}`;
    }
    if (this.statusIconEl) this.statusIconEl.textContent = copied ? '✅' : '⚠️';
    if (this.statusTitleEl) {
      this.statusTitleEl.textContent = copied ? t('shareNotice.copiedSuccessTitle') : t('shareNotice.copiedFailTitle');
    }
    if (this.statusDescEl) {
      this.statusDescEl.textContent = copied ? t('shareNotice.copiedSuccessDesc') : t('shareNotice.copiedFailDesc');
    }

    // STEP 1
    if (this.step1CardEl) {
      this.step1CardEl.className = `share-step-card ${copied ? 'step-completed' : ''}`;
    }
    if (this.step1TitleEl) this.step1TitleEl.textContent = t('shareNotice.step1Title');
    if (this.step1DescEl) this.step1DescEl.textContent = t('shareNotice.step1Desc');
    if (this.step1CheckEl) this.step1CheckEl.textContent = copied ? '✓' : '';

    // STEP 2
    if (this.step2TitleEl) this.step2TitleEl.textContent = t('shareNotice.step2Title');
    if (this.step2DescEl) this.step2DescEl.textContent = t('shareNotice.step2Desc');

    // フォールバック（ポップアップブロック検知）表示制御
    const showBlocked = this.isBlocked || !!this.currentData?.simulateBlocked;
    if (this.blockedBoxEl) {
      if (showBlocked) {
        this.blockedBoxEl.classList.remove('hidden');
      } else {
        this.blockedBoxEl.classList.add('hidden');
      }
    }
    if (this.blockedTitleEl) this.blockedTitleEl.textContent = t('shareNotice.popupBlockedTitle');
    if (this.blockedDescEl) this.blockedDescEl.textContent = t('shareNotice.popupBlockedDesc');
    if (this.fallbackDirectLinkEl) {
      this.fallbackDirectLinkEl.href = this.currentData?.tweetUrl || '#';
    }
    if (this.directLinkLabelEl) this.directLinkLabelEl.textContent = t('shareNotice.directLinkBtn');
    if (this.sameTabLabelEl) this.sameTabLabelEl.textContent = t('shareNotice.sameTabBtn');
    if (this.copyUrlLabelEl) this.copyUrlLabelEl.textContent = t('shareNotice.copyUrlBtn');

    // ボタンラベル
    if (this.openXLabelEl) this.openXLabelEl.textContent = t('shareNotice.openXBtn');
    if (this.downloadLabelEl) this.downloadLabelEl.textContent = t('shareNotice.saveImgBtn');
    if (this.cancelLabelEl) this.cancelLabelEl.textContent = t('shareNotice.closeBtn');
  }

  /**
   * テキストをクリップボードにコピー（旧ブラウザ互換フォールバック）
   * @param {string} text
   */
  fallbackCopyText(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) {
      // ignore
    }
  }

  bindEvents() {
    if (!this.modalEl) return;

    this.modalEl.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);

      // 背景クリックで閉じる
      if (target === this.modalEl) {
        this.hide();
        return;
      }

      // ✕ボタンまたは閉じるボタン
      if (
        target.id === 'share-notice-close-btn' || target.closest('#share-notice-close-btn') ||
        target.id === 'share-notice-cancel-btn' || target.closest('#share-notice-cancel-btn')
      ) {
        this.hide();
        return;
      }

      // 𝕏 を開くボタン (ポップアップブロック自動検知)
      if (target.id === 'share-notice-open-x-btn' || target.closest('#share-notice-open-x-btn')) {
        if (this.currentData?.tweetUrl) {
          let popupBlocked = false;
          try {
            const win = window.open(this.currentData.tweetUrl, '_blank', 'noopener,noreferrer');
            if (!win || win.closed || typeof win.closed === 'undefined') {
              popupBlocked = true;
            }
          } catch (_) {
            popupBlocked = true;
          }

          if (popupBlocked) {
            this.isBlocked = true;
            this.updateContent();
            return; // モーダルを閉じずにフォールバックを表示
          }
        }
        this.hide();
        return;
      }

      // フォールバック: この画面で𝕏に移動するボタン
      if (target.id === 'sn-fallback-sametab-btn' || target.closest('#sn-fallback-sametab-btn')) {
        if (this.currentData?.tweetUrl) {
          window.location.href = this.currentData.tweetUrl;
        }
        return;
      }

      // フォールバック: 投稿URLをコピーボタン
      if (target.id === 'sn-fallback-copy-url-btn' || target.closest('#sn-fallback-copy-url-btn')) {
        if (this.currentData?.tweetUrl) {
          const url = this.currentData.tweetUrl;
          const onCopied = () => {
            if (this.currentData?.showToast) {
              this.currentData.showToast(t('shareNotice.copiedUrlToast'));
            }
          };

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(onCopied).catch(() => {
              this.fallbackCopyText(url);
              onCopied();
            });
          } else {
            this.fallbackCopyText(url);
            onCopied();
          }
        }
        return;
      }

      // 画像を保存ボタン (URL.revokeObjectURL によるメモリ解放対応)
      if (target.id === 'share-notice-download-btn' || target.closest('#share-notice-download-btn')) {
        if (this.currentData?.blob) {
          const blobUrl = URL.createObjectURL(this.currentData.blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = this.currentData.filename || '4lane-block-result.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          // メモリリーク防止: 生成したBlob URLを確実に解放
          setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
          }, 1000);

          if (this.currentData.showToast) {
            this.currentData.showToast(t('result.shareDownloadedToast'));
          }
        }
        return;
      }
    });
  }

  /**
   * モーダルを表示
   * @param {{ blob: Blob, filename: string, tweetUrl: string, copied: boolean, simulateBlocked?: boolean, showToast?: (msg: string) => void }} data
   */
  show(data) {
    this.currentData = data;
    this.isBlocked = !!data.simulateBlocked;
    this.updateContent();
    this.modalEl?.classList.remove('hidden');
  }

  hide() {
    this.modalEl?.classList.add('hidden');
    this.currentData = null;
    this.isBlocked = false;
  }

  updateTexts() {
    if (!this.modalEl || this.modalEl.classList.contains('hidden')) return;
    this.updateContent();
  }
}

/** @type {ShareNoticeModal | null} */
let globalShareNoticeModal = null;

export function getShareNoticeModal() {
  if (!globalShareNoticeModal) {
    globalShareNoticeModal = new ShareNoticeModal();
  }
  return globalShareNoticeModal;
}

/**
 * 「Xに遷移します」アナウンスモーダルを表示
 * @param {{ blob: Blob, filename: string, tweetUrl: string, copied: boolean, showToast?: (msg: string) => void }} data
 */
export function showShareNoticeModal(data) {
  const modal = getShareNoticeModal();
  modal.show(data);
}
