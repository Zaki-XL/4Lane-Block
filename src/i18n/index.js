// @ts-check
import ja from './locales/ja.js';
import en from './locales/en.js';
import zh from './locales/zh.js';
import ko from './locales/ko.js';
import es from './locales/es.js';
import fr from './locales/fr.js';
import { getSavedLanguage, saveLanguage } from '../core/storage.js';

/**
 * 対応6言語の定義
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'ja', name: '日本語' },
  { code: 'en', name: 'English' },
  { code: 'zh', name: '繁體 / 简体中文' },
  { code: 'ko', name: '한국어' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
];

/** @type {Record<string, any>} */
const DICTIONARIES = { ja, en, zh, ko, es, fr };

/**
 * デフォルト・フォールバック言語コード
 */
export const DEFAULT_LANGUAGE = 'en';

/**
 * ブラウザの言語設定を検出する
 * サポート言語に合致しない場合は英語 ('en') を返す
 * @returns {string}
 */
export function detectBrowserLanguage() {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;

  const rawLang = navigator.language || (navigator.languages && navigator.languages[0]) || '';
  const normalized = rawLang.toLowerCase();

  // 1. 完全一致または前方一致判定 (ja-JP -> ja, zh-TW -> zh 等)
  for (const lang of SUPPORTED_LANGUAGES) {
    if (normalized === lang.code || normalized.startsWith(`${lang.code}-`) || normalized.startsWith(`${lang.code}_`)) {
      return lang.code;
    }
  }

  // 2. 該当しない場合は要件に基づき英語 (en) へフォールバック
  return DEFAULT_LANGUAGE;
}

/**
 * 多言語管理マネージャー (Singleton)
 */
class I18nManager {
  constructor() {
    /** @type {string} */
    this.currentLang = DEFAULT_LANGUAGE;
    /** @type {Set<(lang: string) => void>} */
    this.listeners = new Set();

    this.init();
  }

  /**
   * 初期化 (保存言語優先 -> ブラウザ自動判定 -> 英語フォールバック)
   */
  init() {
    const saved = getSavedLanguage();
    if (saved && DICTIONARIES[saved]) {
      this.currentLang = saved;
    } else {
      this.currentLang = detectBrowserLanguage();
    }
    this.updateHtmlLang();
  }

  /**
   * 現在の言語コードを取得
   * @returns {string}
   */
  getLanguage() {
    return this.currentLang;
  }

  /**
   * 言語を変更する
   * @param {string} langCode
   */
  setLanguage(langCode) {
    if (!DICTIONARIES[langCode]) {
      console.warn(`[i18n] Unsupported language code: ${langCode}, fallback to ${DEFAULT_LANGUAGE}`);
      langCode = DEFAULT_LANGUAGE;
    }

    if (this.currentLang === langCode) return;

    this.currentLang = langCode;
    saveLanguage(langCode);
    this.updateHtmlLang();

    // 変更リスナーに通知 (Set反復中の新規追加による無限ループを完全防止するためスナップショットを使用)
    const listenersSnapshot = Array.from(this.listeners);
    for (const listener of listenersSnapshot) {
      try {
        listener(this.currentLang);
      } catch (err) {
        console.error('[i18n] Error in language change listener:', err);
      }
    }
  }

  /**
   * HTMLタグの lang 属性を更新
   */
  updateHtmlLang() {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = this.currentLang;
    }
  }

  /**
   * 言語変更イベントを購読
   * @param {(lang: string) => void} callback
   * @returns {() => void}
   */
  onLanguageChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * 翻訳文字列を取得
   * @param {string} keyPath ドット区切りのキー (例: 'hud.resetBtn')
   * @param {Record<string, any>} [params] 置換パラメータ (例: { n: 5 })
   * @returns {any}
   */
  t(keyPath, params = {}) {
    const keys = keyPath.split('.');
    let val = this.resolveKey(DICTIONARIES[this.currentLang], keys);

    // 見つからない場合は英語フォールバックから探索
    if (val === undefined && this.currentLang !== DEFAULT_LANGUAGE) {
      val = this.resolveKey(DICTIONARIES[DEFAULT_LANGUAGE], keys);
    }

    if (val === undefined) {
      return keyPath; // キーが見つからない場合はキー名を返す
    }

    // 文字列でない場合（オブジェクトや数値など）はそのまま返す
    if (typeof val !== 'string') {
      return val;
    }

    // パラメータ置換 ({name} -> params.name)
    return val.replace(/\{(\w+)\}/g, (match, paramKey) => {
      return params[paramKey] !== undefined ? String(params[paramKey]) : match;
    });
  }

  /**
   * @private
   */
  resolveKey(obj, keys) {
    let current = obj;
    for (const k of keys) {
      if (current === undefined || current === null) return undefined;
      current = current[k];
    }
    return current;
  }
}

// グローバルシングルトンとしてインスタンスを共有
const globalI18n = (typeof globalThis !== 'undefined' && globalThis.__I18N_INSTANCE__)
  ? globalThis.__I18N_INSTANCE__
  : new I18nManager();

if (typeof globalThis !== 'undefined') {
  globalThis.__I18N_INSTANCE__ = globalI18n;
}

export const i18n = globalI18n;
export const t = (keyPath, params = {}) => i18n.t(keyPath, params);

