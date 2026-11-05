#!/usr/bin/env node
/* ============================================================
 * scripts/check-deploy.mjs — 部署自检
 * 对比本地 version.json 与已部署站点上的 version.json，
 * 判断 Cloud Studio / CloudBase 上跑的是不是最新版本。
 *
 * 用法：
 *   node scripts/check-deploy.mjs https://xxxx.cloudbase.app
 *   npm run deploy:check -- https://xxxx.cloudbase.app
 * ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];

if (!target || !/^https?:\/\//i.test(target)) {
  console.error("用法：node scripts/check-deploy.mjs https://你的站点地址");
  process.exit(2);
}

const local = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"));
const base = target.replace(/\/+$/, "");
const url = `${base}/version.json?t=${Date.now()}`;

console.log(`本地版本   v${local.version} · ${local.build}`);
console.log(`正在检查   ${base}`);

let remote;
try {
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  remote = await res.json();
} catch (err) {
  console.error(`\n✗ 无法读取 ${base}/version.json（${err.message}）`);
  console.error("  常见原因：");
  console.error("  1. 站点还是旧部署，旧版本没有 version.json；");
  console.error("  2. 部署根目录不是项目根（version.json 不在站点根）；");
  console.error("  3. 地址写错、站点未启动或 CloudBase 域名还没生效。");
  process.exit(1);
}

console.log(`线上版本   v${remote.version} · ${remote.build}`);
const same = remote.version === local.version && remote.build === local.build;

if (same) {
  console.log("\n✓ 线上与本地版本一致，已同步。若浏览器仍看到旧界面，请强制刷新（Cmd/Ctrl + Shift + R）。");
  process.exit(0);
}

console.log("\n✗ 线上不是最新版本。");
console.log("  · Cloud Studio 工作空间预览：进入工作空间终端，git pull origin main 后刷新预览；");
console.log("  · CloudBase 静态托管：在控制台重新部署（上传最新目录）或重新触发构建流水线；");
console.log("  · 若使用 GitHub 自动部署：检查流水线是否失败、部署分支是否为 main。");
console.log("  部署完成后重新运行本命令，直到输出「已同步」。");
process.exit(1);
