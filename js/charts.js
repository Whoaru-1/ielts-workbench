/* ============================================================
 * charts.js — Task 1 图表渲染（手绘 SVG，深色主题一致）
 * 支持：bar / line / pie / table / process / map / mixed
 * ============================================================ */

const PALETTE = ["#4C9EFF", "#3ECF8E", "#FFB454", "#FF6369", "#7C8CF8", "#2DD4BF"];
const GRID = "#262C36";
const TEXT = "#A7B1BF";
const LABEL = "#78828F";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderChart(chart) {
  if (!chart || !chart.type) return "";
  switch (chart.type) {
    case "bar": return barChart(chart);
    case "line": return lineChart(chart);
    case "pie": return pieChart(chart);
    case "table": return tableChart(chart);
    case "process": return processChart(chart);
    case "map": return mapChart(chart);
    case "mixed": return mixedChart(chart);
    default: return "";
  }
}

function chartFrame(title, body) {
  return `<figure class="chart-figure"><figcaption class="chart-title">${esc(title)}</figcaption>${body}</figure>`;
}

/* ---------- 柱状图 ---------- */
function barChart(c) {
  const W = 560, H = 240, padL = 44, padB = 34, padT = 16;
  const innerW = W - padL - 16, innerH = H - padT - padB;
  const maxV = Math.max(...c.series.flatMap((s) => s.values)) * 1.15 || 1;
  const n = c.categories.length;
  const groupW = innerW / n;
  const barW = Math.min(26, (groupW * 0.7) / c.series.length);
  const y = (v) => padT + innerH - (v / maxV) * innerH;
  let bars = "", ticks = "";
  for (let g = 0; g < n; g++) {
    const gx = padL + g * groupW;
    const offset = (groupW - c.series.length * barW) / 2;
    c.series.forEach((s, si) => {
      const v = s.values[g];
      const bx = gx + offset + si * barW;
      const by = y(v);
      bars += `<rect x="${bx}" y="${by}" width="${barW}" height="${padT + innerH - by}" rx="2" fill="${PALETTE[si % PALETTE.length]}" opacity="0.92"/>`;
      bars += `<text x="${bx + barW / 2}" y="${by - 5}" text-anchor="middle" class="chart-val" fill="${TEXT}" font-size="9.5">${v}</text>`;
    });
    ticks += `<text x="${gx + groupW / 2}" y="${H - 10}" text-anchor="middle" class="chart-axis" fill="${LABEL}" font-size="10">${esc(c.categories[g])}</text>`;
  }
  for (let i = 0; i <= 4; i++) {
    const gy = padT + (innerH / 4) * i;
    const val = Math.round((maxV / 4) * (4 - i) * 10) / 10;
    ticks += `<line x1="${padL}" y1="${gy}" x2="${W - 12}" y2="${gy}" stroke="${GRID}" stroke-width="1"/>`;
    ticks += `<text x="${padL - 6}" y="${gy + 3}" text-anchor="end" class="chart-axis" fill="${LABEL}" font-size="9">${val}</text>`;
  }
  const legend = c.series.map((s, i) => `<span class="chart-legend"><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(s.name)}</span>`).join("");
  return chartFrame(c.title, `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}">${ticks}${bars}</svg><div class="chart-legend-row">${legend}</div></div>`);
}

/* ---------- 折线图 ---------- */
function lineChart(c) {
  const W = 560, H = 240, padL = 44, padB = 34, padT = 16;
  const innerW = W - padL - 16, innerH = H - padT - padB;
  const all = c.series.flatMap((s) => s.values);
  const maxV = Math.max(...all) * 1.15 || 1, minV = Math.min(...all) * 0.9 || 0;
  const span = maxV - minV || 1;
  const n = c.categories.length;
  const y = (v) => padT + innerH - ((v - minV) / span) * innerH;
  const x = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  let lines = "", ticks = "", dots = "";
  c.series.forEach((s, si) => {
    const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    lines += `<polyline points="${pts}" fill="none" stroke="${PALETTE[si % PALETTE.length]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.values.forEach((v, i) => {
      dots += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${PALETTE[si % PALETTE.length]}"/>`;
      dots += `<text x="${x(i)}" y="${y(v) - 7}" text-anchor="middle" class="chart-val" fill="${TEXT}" font-size="9">${v}</text>`;
    });
  });
  c.categories.forEach((cat, i) => {
    ticks += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="chart-axis" fill="${LABEL}" font-size="10">${esc(cat)}</text>`;
  });
  for (let i = 0; i <= 4; i++) {
    const gy = padT + (innerH / 4) * i;
    const val = Math.round((minV + (span / 4) * (4 - i)) * 10) / 10;
    ticks += `<line x1="${padL}" y1="${gy}" x2="${W - 12}" y2="${gy}" stroke="${GRID}" stroke-width="1"/>`;
    ticks += `<text x="${padL - 6}" y="${gy + 3}" text-anchor="end" class="chart-axis" fill="${LABEL}" font-size="9">${val}</text>`;
  }
  const legend = c.series.map((s, i) => `<span class="chart-legend"><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(s.name)}</span>`).join("");
  return chartFrame(c.title, `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}">${ticks}${lines}${dots}</svg><div class="chart-legend-row">${legend}</div></div>`);
}

/* ---------- 饼图 ---------- */
function pieChart(c) {
  const one = (slices, totalLabel) => {
    const R = 78, CX = 100, CY = 100;
    const total = slices.reduce((a, s) => a + s.value, 0) || 1;
    const CIRC = 2 * Math.PI * R;
    let acc = 0, segs = "";
    slices.forEach((s, i) => {
      const frac = s.value / total;
      const len = frac * CIRC;
      const off = -acc * CIRC;
      const col = PALETTE[i % PALETTE.length];
      segs += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${col}" stroke-width="34" stroke-dasharray="${len} ${CIRC - len}" stroke-dashoffset="${off}" transform="rotate(-90 ${CX} ${CY})"/>`;
      acc += frac;
    });
    return `<svg viewBox="0 0 200 200" role="img" aria-label="${esc(c.title)}">${segs}<text x="${CX}" y="${CY + 5}" text-anchor="middle" class="chart-total" fill="${TEXT}" font-size="20" font-weight="700">${c.unit || ""}${totalLabel}</text></svg>`;
  };
  const legend = (slices) => slices.map((s, i) => `<span class="chart-legend"><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(s.name)} <b>${s.value}${c.unit || ""}</b></span>`).join("");
  if (c.slices2) {
    return chartFrame(c.title, `<div class="chart-wrap chart-pie chart-pie-double">
      <div class="chart-pie-item"><div class="chart-pie-name">1990</div>${one(c.slices, "")}</div>
      <div class="chart-pie-item"><div class="chart-pie-name">2020</div>${one(c.slices2, "")}</div>
      <div class="chart-legend-row chart-legend-col">${legend(c.slices)}</div>
    </div>`);
  }
  return chartFrame(c.title, `<div class="chart-wrap chart-pie">${one(c.slices, c.slices.reduce((a, s) => a + s.value, 0))}<div class="chart-legend-row chart-legend-col">${legend(c.slices)}</div></div>`);
}

/* ---------- 表格 ---------- */
function tableChart(c) {
  const head = c.columns.map((h) => `<th>${esc(h)}</th>`).join("");
  const rows = c.rows.map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("");
  return chartFrame(c.title, `<div class="chart-table-wrap"><table class="chart-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`);
}

/* ---------- 流程图 ---------- */
function processChart(c) {
  const steps = c.steps.map((s, i) =>
    `<div class="chart-step"><span class="chart-step-num">${i + 1}</span><span>${esc(s)}</span></div>`
  ).join('<span class="chart-step-arrow">→</span>');
  return chartFrame(c.title, `<div class="chart-process">${steps}</div>`);
}

/* ---------- 地图（before/after） ---------- */
function mapChart(c) {
  const col = (items) => items.map((it) => `<li>${esc(it)}</li>`).join("");
  return chartFrame(c.title, `<div class="chart-map">
    <div class="chart-map-col"><h4>过去</h4><ul>${col(c.before)}</ul></div>
    <span class="chart-map-arrow">→</span>
    <div class="chart-map-col"><h4>现在</h4><ul>${col(c.after)}</ul></div>
  </div>`);
}

/* ---------- 混合图 ---------- */
function mixedChart(c) {
  const main = c.series.length === 1 && c.series[0].type === undefined ? lineChart({ ...c, type: "line" }) : barChart({ ...c, type: "bar" });
  const tbl = tableChart({ title: c.table ? c.table.title || "附表" : "附表", columns: c.table?.columns || [], rows: c.table?.rows || [] });
  return `<div class="chart-mixed">${main}${tbl}</div>`;
}
