// @ts-check
import { t } from '../i18n/index.js';
import { GameTimer } from '../core/timer.js';
import { showShareNoticeModal } from './share_notice_modal.js';

/**
 * 角丸矩形パスの描画ポリフィル/ヘルパー
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 */
function drawRoundRect(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

/**
 * 通常クリア用 16:9 リザルトカード画像の生成
 * @param {Object} options
 * @param {import('../core/types.js').GameClearResult} options.result
 * @param {any} options.evalResult ランク判定データ
 * @param {import('../core/types.js').Lane[]} options.lanes 盤面の最終レーン状態
 * @param {number} options.difficultyLevel 難易度
 * @param {number} options.heightLimit 段数
 * @param {boolean} options.isNewRecord ハイスコア更新フラグ
 * @param {string} options.shareUrl 共有URL
 * @returns {Promise<Blob>}
 */
export async function generateResultCardBlob(options) {
  const { result, evalResult, lanes, difficultyLevel, heightLimit, isNewRecord, shareUrl } = options;

  const width = 1200;
  const height = 675;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context could not be created');

  // 1. 背景グラデーション (深藍色・サイバーゲーム風)
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#090d16');
  bgGrad.addColorStop(0.5, '#0f172a');
  bgGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // ランクに応じた光彩 (RANK Sならゴールド、その他はシアン)
  const isRankS = evalResult.rank === 'S';
  const glowGrad = ctx.createRadialGradient(320, 260, 50, 320, 260, 400);
  glowGrad.addColorStop(0, isRankS ? 'rgba(251, 191, 36, 0.15)' : 'rgba(56, 189, 248, 0.12)');
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, width, height);

  // 微細なグリッドパターン
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 外枠 (28px 角丸・微細ボーダー)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  drawRoundRect(ctx, 20, 20, width - 40, height - 40, 24);
  ctx.stroke();

  // 2. ヘッダー描画 (Y: 45〜90)
  // タイトルロゴ
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 36px "Segoe UI", Roboto, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('4Lane Block', 60, 68);

  // 難易度 ＆ 段数バッジ
  const diffBadgeText = `${t('result.difficulty')} Lv ${difficultyLevel} (${t('hud.tiers', { n: heightLimit })})`;
  ctx.font = '600 18px "Segoe UI", Roboto, sans-serif';
  const diffWidth = ctx.measureText(diffBadgeText).width;
  ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
  drawRoundRect(ctx, width - 60 - diffWidth - 28, 48, diffWidth + 28, 36, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'right';
  ctx.fillText(diffBadgeText, width - 74, 68);

  // ヘッダー下区切り線
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(60, 105);
  ctx.lineTo(width - 60, 105);
  ctx.stroke();

  // 3. 左側エリア: ランク ＆ スコアカード (X: 60〜520)
  // ランクバッジ
  const rankColors = {
    S: { bg: 'linear-gradient(135deg, #f59e0b, #fbbf24)', text: '#78350f', border: '#fef08a' },
    A: { bg: 'linear-gradient(135deg, #0284c7, #38bdf8)', text: '#082f49', border: '#bae6fd' },
    B: { bg: 'linear-gradient(135deg, #059669, #34d399)', text: '#022c22', border: '#a7f3d0' },
    C: { bg: 'linear-gradient(135deg, #475569, #64748b)', text: '#0f172a', border: '#cbd5e1' }
  };
  const rColor = rankColors[evalResult.rank] || rankColors.C;

  // ランク外枠 & グラデーション
  const rankGrad = ctx.createLinearGradient(60, 135, 260, 135);
  if (evalResult.rank === 'S') {
    rankGrad.addColorStop(0, '#f59e0b');
    rankGrad.addColorStop(1, '#fbbf24');
  } else if (evalResult.rank === 'A') {
    rankGrad.addColorStop(0, '#0284c7');
    rankGrad.addColorStop(1, '#38bdf8');
  } else {
    rankGrad.addColorStop(0, '#059669');
    rankGrad.addColorStop(1, '#34d399');
  }
  ctx.fillStyle = rankGrad;
  drawRoundRect(ctx, 60, 135, 180, 52, 14);
  ctx.fill();

  ctx.fillStyle = rColor.text;
  ctx.font = '900 28px "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`RANK ${evalResult.rank}`, 150, 163);

  // 星マーク描画 (★)
  const starCount = evalResult.stars || 1;
  let starsStr = '';
  for (let i = 0; i < 3; i++) {
    starsStr += i < starCount ? '★' : '☆';
  }
  ctx.font = '28px sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'left';
  ctx.fillText(starsStr, 260, 164);

  // 評価タイトル (PERFECT! / EXCELLENT! 等: 多言語辞書から取得)
  const evalTitle = t('result.evalTitles.' + (evalResult.rank || 'c').toLowerCase());
  ctx.font = 'bold 32px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'left';
  ctx.fillText(evalTitle, 60, 230);

  // スコアカードコンテナ (角丸長方形)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  drawRoundRect(ctx, 60, 265, 460, 260, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // スコアラベル
  ctx.font = '600 16px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'left';
  ctx.fillText(t('result.totalScore'), 88, 305);

  // スコア数値 (大文字)
  ctx.font = 'bold 58px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = isRankS ? '#fbbf24' : '#38bdf8';
  ctx.fillText(evalResult.score.toLocaleString(), 88, 370);

  // NEW RECORD バッジ
  if (isNewRecord) {
    ctx.font = 'bold 15px "Segoe UI", Roboto, sans-serif';
    const nrText = t('result.newRecord');
    const nrWidth = ctx.measureText(nrText).width;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    drawRoundRect(ctx, 88, 395, nrWidth + 20, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#f87171';
    ctx.textAlign = 'center';
    ctx.fillText(nrText, 88 + (nrWidth + 20) / 2, 414);
  }

  // スコア内訳情報
  ctx.font = '500 16px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'left';
  const diffMultiText = `${t('result.diffMultiplier')} x${(1 + (difficultyLevel - 1) * 0.2).toFixed(1)}`;
  const bonusText = `${t('result.bonus')} ${evalResult.bonus || 0}`;
  ctx.fillText(`${diffMultiText}  |  ${bonusText}`, 88, 460);
  ctx.fillText(`${t('result.efficiency')} ${evalResult.efficiencyText || '--'}`, 88, 492);

  // 4. 右側エリア: 完成盤面ミニチュア ＆ 記録 (X: 560〜1140)
  // ミニ盤面コンテナ
  const boardBoxX = 560;
  const boardBoxY = 135;
  const boardBoxW = 580;
  const boardBoxH = 240;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
  drawRoundRect(ctx, boardBoxX, boardBoxY, boardBoxW, boardBoxH, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.stroke();

  // レーン描画 (4レーン)
  const laneGap = 16;
  const laneWidth = (boardBoxW - 48 - laneGap * 3) / 4;
  const laneStartX = boardBoxX + 24;
  const laneY = boardBoxY + 20;
  const laneH = boardBoxH - 40;

  const colorMap = {
    RED: { top: '#f87171', bot: '#dc2626' },
    BLUE: { top: '#60a5fa', bot: '#2563eb' },
    GREEN: { top: '#34d399', bot: '#059669' }
  };

  for (let lIdx = 0; lIdx < 4; lIdx++) {
    const lx = laneStartX + lIdx * (laneWidth + laneGap);
    // レーン背景スロット
    ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
    drawRoundRect(ctx, lx, laneY, laneWidth, laneH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.stroke();

    const lane = lanes[lIdx] || [];
    if (lane.length === 0) {
      // 空レーン表示 (うっすら破線)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.setLineDash([4, 4]);
      drawRoundRect(ctx, lx + 4, laneY + 4, laneWidth - 8, laneH - 8, 8);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // ブロック積み上げ描画 (下から上へ)
      const maxSlots = Math.max(heightLimit, lane.length);
      const blockMargin = 3;
      const blockH = Math.min(26, (laneH - 12 - (maxSlots - 1) * blockMargin) / maxSlots);

      for (let bIdx = 0; bIdx < lane.length; bIdx++) {
        const block = lane[bIdx];
        const by = laneY + laneH - 8 - (bIdx + 1) * blockH - bIdx * blockMargin;
        const cConfig = colorMap[block.color] || colorMap.BLUE;

        const bGrad = ctx.createLinearGradient(lx + 6, by, lx + laneWidth - 6, by + blockH);
        bGrad.addColorStop(0, cConfig.top);
        bGrad.addColorStop(1, cConfig.bot);
        ctx.fillStyle = bGrad;
        drawRoundRect(ctx, lx + 6, by, laneWidth - 12, blockH, 5);
        ctx.fill();
      }
    }
  }

  // 右下: タイム ＆ 手数 ＆ シード表示 (2分割カード)
  const statBoxY = 395;
  const statCardW = (boardBoxW - 16) / 2;

  // クリアタイム
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  drawRoundRect(ctx, boardBoxX, statBoxY, statCardW, 130, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.stroke();

  ctx.font = '600 15px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'left';
  ctx.fillText(`⏱ ${t('result.clearTime')}`, boardBoxX + 20, statBoxY + 32);

  ctx.font = 'bold 34px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(GameTimer.formatTime(result.elapsedTime), boardBoxX + 20, statBoxY + 84);

  // 総手数
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  drawRoundRect(ctx, boardBoxX + statCardW + 16, statBoxY, statCardW, 130, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.stroke();

  ctx.font = '600 15px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`🔄 ${t('result.totalMoves')}`, boardBoxX + statCardW + 36, statBoxY + 32);

  ctx.font = 'bold 34px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(t('result.movesUnit', { n: result.moveCount }), boardBoxX + statCardW + 36, statBoxY + 84);

  // 5. フッターエリア (Y: 565〜635)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(60, 565);
  ctx.lineTo(width - 60, 565);
  ctx.stroke();

  // 挑戦URL ＆ Salt
  ctx.font = '500 16px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const urlDisplay = shareUrl.length > 55 ? shareUrl.substring(0, 52) + '...' : shareUrl;
  ctx.fillText(`🔗 ${t('result.saltLabel')} ${result.salt}  (${urlDisplay})`, 60, 605);

  // ハッシュタグ
  ctx.font = 'bold 18px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'right';
  ctx.fillText('#4LaneBlock', width - 60, 605);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

/**
 * RTA走破完了用 16:9 リザルトカード画像の生成
 * @param {Object} options
 * @param {any} options.runState
 * @param {any} options.result
 * @param {string} options.shareUrl
 * @returns {Promise<Blob>}
 */
export async function generateRTAResultCardBlob(options) {
  const { runState, result, shareUrl } = options;

  const width = 1200;
  const height = 675;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context could not be created');

  // 1. 背景グラデーション (スピード感のあるサイバーオレンジ・パープル)
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.5, '#1e1b4b');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 光彩
  const glowGrad = ctx.createRadialGradient(280, 240, 50, 280, 240, 450);
  glowGrad.addColorStop(0, 'rgba(168, 85, 247, 0.18)');
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, width, height);

  // 外枠
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  drawRoundRect(ctx, 20, 20, width - 40, height - 40, 24);
  ctx.stroke();

  // 2. ヘッダー
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 36px "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('4Lane Block RTA', 60, 68);

  const modeName = runState.mode === 'marathon'
    ? `${t('rta.marathonShort')} (Lv10)`
    : `${t('rta.countupShort')} (${t('hud.tiers', { n: runState.baseHeight })})`;

  ctx.font = '600 18px "Segoe UI", Roboto, sans-serif';
  const modeWidth = ctx.measureText(modeName).width;
  ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
  drawRoundRect(ctx, width - 60 - modeWidth - 28, 48, modeWidth + 28, 36, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#c084fc';
  ctx.textAlign = 'right';
  ctx.fillText(modeName, width - 74, 68);

  // ヘッダー下区切り線
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(60, 105);
  ctx.lineTo(width - 60, 105);
  ctx.stroke();

  // 3. 左側: 総合タイム ＆ 総合スコア (特大デジタル表示)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  drawRoundRect(ctx, 60, 135, 480, 390, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // トロフィーバッジ
  ctx.font = 'bold 22px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'left';
  ctx.fillText(`🏆 ${t('rta.completeTitle')}`, 88, 175);

  // 総合タイム
  ctx.font = '600 16px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(t('rta.totalRunTime'), 88, 225);

  ctx.font = '900 56px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(GameTimer.formatTime(runState.totalElapsedMs), 88, 290);

  if (result?.isNewTimeRecord) {
    ctx.font = 'bold 15px "Segoe UI", Roboto, sans-serif';
    const nrText = t('rta.newRecord');
    const nrWidth = ctx.measureText(nrText).width;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    drawRoundRect(ctx, 88, 310, nrWidth + 20, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#f87171';
    ctx.textAlign = 'center';
    ctx.fillText(nrText, 88 + (nrWidth + 20) / 2, 329);
    ctx.textAlign = 'left';
  }

  // 総合スコア ＆ 総手数
  ctx.font = '600 16px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(t('rta.finalScore'), 88, 385);

  ctx.font = 'bold 36px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(runState.totalScore.toLocaleString(), 88, 430);

  ctx.font = '500 18px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`🔄 ${t('rta.totalMoves')}: ${t('result.movesUnit', { n: runState.totalMoves })}`, 88, 485);

  // 4. 右側: スプリット（各面ラップタイム一覧）
  const splitBoxX = 580;
  const splitBoxY = 135;
  const splitBoxW = 560;
  const splitBoxH = 390;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  drawRoundRect(ctx, splitBoxX, splitBoxY, splitBoxW, splitBoxH, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.stroke();

  ctx.font = 'bold 20px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'left';
  ctx.fillText(`🏃 ${t('rta.splitsTitle')}`, splitBoxX + 24, splitBoxY + 35);

  // スプリット上位/ハイライト表示
  const splits = Array.isArray(runState.splits) ? runState.splits : [];
  const displaySplits = splits.slice(0, 8); // 最大8ステージを一覧表示
  const rowH = 36;
  const startRowY = splitBoxY + 65;

  ctx.font = '600 14px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(t('rta.colStage'), splitBoxX + 24, startRowY);
  ctx.fillText(t('rta.splitsLap'), splitBoxX + 180, startRowY);
  ctx.fillText(t('rta.splitsTotal'), splitBoxX + 320, startRowY);
  ctx.fillText(t('rta.splitsScore'), splitBoxX + 450, startRowY);

  displaySplits.forEach((sp, idx) => {
    const ry = startRowY + 28 + idx * rowH;
    ctx.fillStyle = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.03)' : 'transparent';
    ctx.fillRect(splitBoxX + 16, ry - 18, splitBoxW - 32, rowH);

    ctx.font = '500 15px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    const stageDisplayName = runState.mode === 'marathon' ? t('hud.tiers', { n: sp.stageParam || (3 + idx) }) : `Lv ${sp.stageParam || (1 + idx)}`;
    ctx.fillText(stageDisplayName, splitBoxX + 24, ry);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(GameTimer.formatTime(sp.lapTimeMs), splitBoxX + 180, ry);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(GameTimer.formatTime(sp.totalTimeMs), splitBoxX + 320, ry);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(sp.score.toLocaleString(), splitBoxX + 450, ry);
  });

  if (splits.length > 8) {
    ctx.font = 'italic 13px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(t('rta.moreStages', { n: splits.length - 8 }), splitBoxX + 24, startRowY + 28 + 8 * rowH);
  }

  // 5. フッター
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(60, 565);
  ctx.lineTo(width - 60, 565);
  ctx.stroke();

  ctx.font = '500 16px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const urlDisplay = shareUrl.length > 55 ? shareUrl.substring(0, 52) + '...' : shareUrl;
  ctx.fillText(`🔗 ${urlDisplay}`, 60, 605);

  ctx.font = 'bold 18px "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#c084fc';
  ctx.textAlign = 'right';
  ctx.fillText('#4LaneBlock #Speedrun', width - 60, 605);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

/**
 * 共有アクションの統合実行（PC・スマホ共通: アナウンスモーダル経由）
 * @param {Object} params
 * @param {Blob} params.blob 生成された画像Blob
 * @param {string} params.filename 保存ファイル名
 * @param {string} params.text 共有本文
 * @param {string} params.url 共有URL
 * @param {string} [params.title] 共有タイトル (互換性用)
 * @param {(message: string) => void} [params.showToast] トースト通知コールバック
 */
export async function executeShare(params) {
  const { blob, filename, text, url, showToast } = params;

  // 1. クリップボードへの画像書き込みを同期/即時試行 (タブにフォーカスがある状態で実行)
  let copied = false;
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      copied = true;
    } catch (err) {
      console.warn('Clipboard image write failed:', err);
    }
  }

  // 2. 𝕏 (Twitter) Web Intent URL の作成
  const tweetText = `${text}\n${url}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  // 3. PC・スマホ共通: 「Xに遷移します」アナウンスモーダルを表示
  showShareNoticeModal({
    blob,
    filename,
    tweetUrl,
    copied,
    showToast
  });
}
