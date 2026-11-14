// Disegna il riepilogo dell'album su canvas: nessuna dipendenza, stesso output su desktop e iOS.
import { ALBUM_TEXT } from "./final-texts.js";

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const HAND = '"Segoe Script", "Bradley Hand", "Bradley Hand ITC", "Noteworthy", "Caveat", cursive';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

const COLORS = {
  page: "#f6ecd7",
  ink: "#2b2320",
  soft: "#5a4c43",
  dark: "#241b1c",
  cream: "#f6ecd7",
  terra: "#a8452f",
  terraLight: "#e3a180",
  gold: "#d9a441",
  sage: "#3e5d4b",
  berry: "#8c2f27",
  tree: ["#aec7a1", "#e0b268", "#3e5d4b"],
  treeOff: "#e8dcc2",
};

const WIDTH = 1080;
const PAD = 64;
const HEADER_H = 330;
const COL_GAP = 52;
const COL_W = (WIDTH - PAD * 2 - COL_GAP) / 2;

function wrapText(ctx, text, maxWidth, maxLines = Infinity) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  if (!lines.length) lines.push("");

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+$/, "")}…`;
    return kept;
  }

  return lines;
}

function dottedRule(ctx, x1, y, x2) {
  ctx.save();
  ctx.strokeStyle = "rgba(43, 35, 32, 0.32)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 6]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function toneColor(tone) {
  if (tone === "ok") return COLORS.sage;
  if (tone === "hint") return COLORS.gold;
  if (tone === "ko") return COLORS.berry;
  return COLORS.soft;
}

// Alberello decorativo: le tre fasce si colorano in base al risultato, senza legenda.
function drawTree(ctx, cx, top, bandIndex) {
  ctx.save();
  ctx.fillStyle = "#9c7a52";
  ctx.fillRect(cx - 9, top + 158, 18, 30);

  const tiers = [
    { points: [[cx, top + 78], [cx - 84, top + 164], [cx + 86, top + 162]] },
    { points: [[cx, top + 42], [cx - 68, top + 122], [cx + 70, top + 120]] },
    { points: [[cx, top + 4], [cx - 52, top + 84], [cx + 54, top + 82]] },
  ];

  tiers.forEach((tier, index) => {
    ctx.beginPath();
    ctx.moveTo(tier.points[0][0], tier.points[0][1]);
    for (const point of tier.points.slice(1)) ctx.lineTo(point[0], point[1]);
    ctx.closePath();
    ctx.fillStyle = index <= bandIndex ? COLORS.tree[index] : COLORS.treeOff;
    ctx.fill();
    ctx.strokeStyle = "rgba(43, 35, 32, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  if (bandIndex >= 2) {
    const starY = top - 4;
    ctx.beginPath();
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 === 0 ? 14 : 6;
      const angle = (-90 + index * 36) * Math.PI / 180;
      const x = cx + radius * Math.cos(angle);
      const y = starY + radius * Math.sin(angle);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = COLORS.gold;
    ctx.fill();
  }

  ctx.restore();
}

function layoutColumn(ctx, rows) {
  const items = [];
  let y = 0;

  for (const row of rows) {
    ctx.font = `27px ${SERIF}`;
    const questionLines = wrapText(ctx, row.question, COL_W - 126, 4);

    ctx.font = `italic 24px ${SERIF}`;
    const answerLines = wrapText(
      ctx,
      row.answer ? `${ALBUM_TEXT.answerPrefix}${row.answer}` : ALBUM_TEXT.emptyAnswer,
      COL_W - 50,
      2
    );

    const correctLines = row.correct && row.tone === "ko"
      ? wrapText(ctx, `${ALBUM_TEXT.correctPrefix}${row.correct}`, COL_W - 50, 2)
      : [];

    const height =
      14 +
      questionLines.length * 34 +
      answerLines.length * 28 +
      (correctLines.length ? correctLines.length * 24 + 4 : 0) +
      18;

    items.push({ row, questionLines, answerLines, correctLines, height, y });
    y += height;
  }

  return { items, height: y };
}

function drawColumn(ctx, x, top, layout, rows) {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = COLORS.terra;
  ctx.font = `30px ${HAND}`;
  ctx.fillText(`${rows[0].day} – ${rows[rows.length - 1].day}`, x, top - 42);

  for (const item of layout.items) {
    const { row, questionLines, answerLines, correctLines, height } = item;
    const y = top + item.y;
    const right = x + COL_W;

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.terra;
    ctx.font = `34px ${SERIF}`;
    ctx.fillText(String(row.day), x, y + 8);

    ctx.fillStyle = COLORS.ink;
    ctx.font = `27px ${SERIF}`;
    questionLines.forEach((line, index) => {
      ctx.fillText(line, x + 46, y + 8 + index * 34);
    });

    ctx.textAlign = "right";
    ctx.fillStyle = toneColor(row.tone);
    ctx.font = `26px ${SERIF}`;
    ctx.fillText(row.pointsLabel, right, y + 6);

    ctx.fillStyle = COLORS.soft;
    ctx.font = `18px ${SANS}`;
    ctx.fillText(row.status, right, y + 38);

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.soft;
    ctx.font = `italic 24px ${SERIF}`;
    const answerTop = y + 8 + questionLines.length * 34 + 4;
    answerLines.forEach((line, index) => {
      ctx.fillText(line, x + 46, answerTop + index * 28);
    });

    if (correctLines.length) {
      ctx.font = `italic 22px ${SERIF}`;
      const correctTop = answerTop + answerLines.length * 28 + 4;
      correctLines.forEach((line, index) => {
        ctx.fillText(line, x + 46, correctTop + index * 24);
      });
    }

    dottedRule(ctx, x, y + height - 8, right);
  }
}

export async function createAlbumImage({ score, maxScore, message, dateLabel, rows, bandIndex = 0 }) {
  if (document.fonts?.ready) await document.fonts.ready;

  const measureCanvas = document.createElement("canvas");
  const measure = measureCanvas.getContext("2d");
  const leftRows = rows.slice(0, 12);
  const rightRows = rows.slice(12);

  const left = layoutColumn(measure, leftRows);
  const right = layoutColumn(measure, rightRows);

  measure.font = `italic 32px ${SERIF}`;
  const messageLines = wrapText(measure, message, WIDTH - PAD * 2);
  const messageHeight = messageLines.length * 44;

  const columnsTop = HEADER_H + 62;
  const columnsHeight = Math.max(left.height, right.height);
  const messageTop = columnsTop + columnsHeight + 34;
  const treeTop = messageTop + messageHeight + 30;
  const treeHeight = 220;
  const footerTop = treeTop + treeHeight + 24;
  const height = footerTop + 84;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, WIDTH, height);

  ctx.fillStyle = COLORS.dark;
  ctx.fillRect(0, 0, WIDTH, HEADER_H);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = COLORS.terraLight;
  ctx.font = `30px ${HAND}`;
  ctx.fillText(ALBUM_TEXT.image.hand, PAD, 48);

  ctx.fillStyle = COLORS.cream;
  ctx.font = `56px ${SERIF}`;
  ctx.fillText(ALBUM_TEXT.image.title, PAD, 88);

  ctx.fillStyle = "rgba(246, 236, 215, 0.68)";
  ctx.font = `24px ${SERIF}`;
  ctx.fillText(dateLabel, PAD, 166);

  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.terraLight;
  ctx.font = `22px ${HAND}`;
  ctx.fillText(ALBUM_TEXT.image.scoreLabel, WIDTH - PAD, 92);

  ctx.fillStyle = COLORS.gold;
  ctx.font = `58px ${SERIF}`;
  ctx.fillText(`${score} / ${maxScore}`, WIDTH - PAD, 120);

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(246, 236, 215, 0.2)";
  ctx.fillRect(PAD, HEADER_H - 26, WIDTH - PAD * 2, 1.5);

  drawColumn(ctx, PAD, columnsTop, left, leftRows);
  drawColumn(ctx, PAD + COL_W + COL_GAP, columnsTop, right, rightRows);

  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(PAD, messageTop - 22, WIDTH - PAD * 2, 1.5);

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.ink;
  ctx.font = `italic 32px ${SERIF}`;
  messageLines.forEach((line, index) => {
    ctx.fillText(line, WIDTH / 2, messageTop + index * 44);
  });

  drawTree(ctx, WIDTH / 2, treeTop, bandIndex);

  ctx.fillStyle = COLORS.soft;
  ctx.font = `26px ${HAND}`;
  ctx.fillText(ALBUM_TEXT.image.foot, WIDTH / 2, footerTop + 6);

  return canvas;
}
