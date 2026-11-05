# IELTS 工作台 · 备考工作台

一个本地优先的雅思备考工作台：词汇、真题模考、写作、口语、个人素材、AI 助手、计划打卡、进度看板八大模块合一的白瓷气泡风格工作台——白 + 天青蓝、独立气泡导航、浮岛式分栏布局。

- **纯静态零构建**：HTML + CSS + 原生 JS，无需 Node/构建步骤，任何静态托管直接可用
- **数据本地保存**：进度存在浏览器 localStorage，不经过任何服务器
- **导入 / 导出**：一键导出 JSON 备份，可随时导入（合并或覆盖）到任意浏览器

## 功能

| 模块 | 说明 |
|---|---|
| 进度看板 | 考试倒计时、目标分数、连续打卡、今日任务、模块概览、操作日志 |
| 词汇 | 生词本（内置 2000+ 分话题词库：12 大话题）、按话题与状态筛选、增删改、状态流转、10 题自测 |
| 真题模考 | 听力/阅读/写作模考计时器、18 种题型攻略（听 7 + 读 11）、错题本、成绩记录与自动估分 |
| 写作 | 内置 80 道写作样题（Task2 议论文 60 + Task1 图表 20）+ 全部高分范文（T2 260-290 词 / T1 150-180 词），随机抽题、一键带入记录 |
| 口语 | 内置 480 道题库（P1 210 / P2 90 / P3 180），其中 **150 道为联网整理的 2025–2026 考场真题回忆**（标记「2026 新题」可单独筛选）+ 全部高分参考答案，按 Part/话题筛选、随机抽题、标记已练、一键带入记录 |
| 个人素材 | 输入中文/英文笔记 → 自动识别主题与素材类型、提取关键词、生成 P1/P2/P3 三档英文高分素材、匹配相关真题；**主题相近的素材自动归纳合并**（保留原文与合并历史），也可手动合并、追加内容、复制润色提示词 |
| AI 助手 | 站内 Agent：对话 + 调用工具，直接查进度、搜词汇/口语题库、加单词、建素材、排任务、记练习；支持任意 OpenAI 兼容端点（默认 DeepSeek），API Key 只存本机浏览器 |
| 计划打卡 | 每日任务清单、手动打卡、近 14 天达标格子图、连续天数 |
| 设置与数据 | 目标分数、考试日期、每日目标；导出/导入 JSON；清空数据 |

## AI 助手（BYOK）

侧栏「助手」是**能操作工作台数据的 Agent**，不只是聊天：

- **工具调用**：`get_overview` 查学习概览、`search_vocab`/`add_vocab` 管词汇、`search_speaking`/`get_speaking_answer` 查题库、`list_materials`/`create_material` 建素材、`add_task`/`list_tasks` 排计划、`log_practice` 记练习、`search_writing` 查写作题库。
- **BYOK**：在「助手 → 设置」填 Base URL / 模型 / API Key。默认 `https://api.deepseek.com/v1` + `deepseek-chat`；任何 OpenAI 兼容端点（含本地 Ollama）都行。
- **隐私**：Key 只存在当前浏览器的 `localStorage`，不会进入「导出 JSON」，也不会发往本项目任何服务器；对话直接发给你填的模型服务商。
- **无 Key 也能看**：页面会给出配置引导；工作台其他功能完全不受影响。
- DeepSeek Key 获取：<https://platform.deepseek.com/api_keys>。

> 这是 BYOK（Bring Your Own Key）设计：站点本身不代管账号或额度，适合个人本地使用。

## 内容来源

- 口语 150 道新题来自公开的考后回忆（机经）整理，覆盖 2025-07 ~ 2026-10 的考场话题；**非官方出版物**，题面做了轻度规范化。
- 原始清单、选题与写作标准见 [`docs/speaking-2026-recall.md`](docs/speaking-2026-recall.md)；个人素材模块的引擎契约见 [`docs/materials-spec.md`](docs/materials-spec.md)。
- 参考答案为按 Band 7.5–8.5 标准撰写的示范稿，用于学习结构与表达，**不要背诵**。

## 本地运行

```bash
# 任意静态服务器即可，例如：
python3 -m http.server 4173
# 浏览器打开 http://localhost:4173
# 或：npm run serve
```

数据校验（无需安装依赖）：

```bash
npm run check   # 口语题库 + 素材引擎 + AI Agent 自测
npm run mock:llm  # 本地 mock 模型（8799），没有 Key 时联调助手
```

> 注意：直接双击打开 `index.html`（file:// 协议）时 ES Module 会被浏览器拦截，请务必通过 HTTP 访问。

## 数据说明

- 数据存于 `localStorage`（键：`ielts-workbench:v1`），导出文件为 `ielts-progress-YYYY-MM-DD.json`。
- 内置分话题词库（2000+ 词）会在首次打开时自动写入（老用户只会增量补齐缺失词，不会覆盖或删除你已有的词），标记为非官方词表，可自由修改。
- 听力/阅读的题数→band 估分映射为常见参考值，不同试卷难度有差异，仅作参考；写作/口语为自评。
- 个人素材同样存在该 localStorage 里（随「导出 JSON」一起备份），**不会**上传到任何服务器；英文素材由本地规则引擎生成（非大模型联网生成），建议按自己的经历微调后再使用，详情页可一键复制润色提示词。

---

## Cloud Studio 部署指南（腾讯云）

Cloud Studio 是腾讯云的云端 IDE，可以把本项目部署成可公开访问的网站。推荐流程：

### 方式 A：静态网站托管（推荐，永久链接）

1. **推送代码到 GitHub**（见下方「推送 GitHub」）。
2. 打开 [Cloud Studio 控制台](https://www.cloudstudio.net/) 并登录（可用微信/QQ/腾讯云账号）。
3. 选择 **新建工作空间** → 来源选 **Git 仓库**，粘贴你的仓库地址（如 `https://github.com/<你的用户名>/ielts-workbench.git`），环境选择 **Node.js** 或默认即可，创建并启动。
4. 空间启动后，在顶部菜单找 **应用/部署** 或 **云开发 CloudBase** → **静态网站托管**（[CloudBase 静态托管文档](https://docs.cloudbase.net/hosting/web-hosting-static)），把项目根目录（含 `index.html`）上传或关联仓库部署，入口文件选 `index.html`。
5. 部署完成后会生成一个 `https://xxxx.cloudbase.app`（或腾讯云分配的域名）链接，即你的网站地址。

### 方式 B：工作空间内预览（临时链接）

1. 同方式 A 第 2–3 步创建并打开工作空间。
2. 直接使用仓库自带的 `.vscode/preview.yml`（端口 3000、工作目录 `./`）；或在终端手动运行：

   ```bash
   python3 -m http.server 3000
   ```

3. 点击 IDE 的「端口」标签，对 3000 端口点 **转发/公网访问**，得到临时预览链接（工作空间关闭后失效）。

### 提示

- 纯静态站无后端，部署后**所有数据仍在访问者自己的浏览器里**，这是设计使然；备份请用「导出 JSON」。
- 想在手机上用：把部署链接发给微信/QQ，用浏览器打开即可，界面会自动适配。
- 国内访问建议用 Gitee 或 CODING 仓库，流程一致。

---

## 更新已部署的站点（GitHub 推送 ≠ Cloud Studio 自动同步）

**这是最常见的困惑：`git push` 只更新了 GitHub，Cloud Studio 里的工作空间/静态托管都是独立副本，不会自动拉取。**

| 部署方式 | 为什么不更新 | 正确做法 |
|---|---|---|
| Cloud Studio **工作空间预览** | 工作空间在创建时克隆了一份代码，之后不会自动 pull | 进工作空间终端：`git pull origin main`，刷新预览链接 |
| CloudBase **静态网站托管（上传目录）** | 部署的是上传那一刻的快照 | 控制台重新上传最新项目根目录并部署 |
| CloudBase **关联 GitHub 自动部署** | 流水线未触发 / 失败 / 分支不是 `main` | 看部署流水线日志，重新触发构建 |
| 浏览器/微信内置浏览器 | 缓存的旧 `index.html`、`app.js` | 强制刷新（Cmd/Ctrl + Shift + R），或换无痕窗口 |

### 三步确认是否真的更新

```bash
# 1. 工作空间里确认提交号（应与 GitHub 最新提交一致）
git log -1 --oneline

# 2. 拉取最新代码（工作空间预览方式）
git pull origin main

# 3. 对比线上与本地版本
npm run deploy:check -- https://你的站点地址
```

也可以用 `curl https://你的站点地址/version.json` 直接看线上版本；站点「设置与数据 → 关于」里也有「部署自检」，会显示当前页面实际加载的版本。**如果看不到 version.json，说明访问到的是旧部署。**

> 每次发布新功能时，把 `version.json` 的 `version` / `build` 更新一下，线上就能通过「部署自检」和 `deploy:check` 一眼看出是否同步。

> Cloud Studio 预览配置 `.vscode/preview.yml` 里 `root` 必须是 `./`，否则 `python http.server` 会把文件系统根目录当成网站根，表现为目录列表或静态资源 404（仓库里已修好）。

---

## CloudBase CLI：安装、登录与部署

### 1. 安装（不需要 sudo）

```bash
mkdir -p ~/.local
npm i -g --prefix ~/.local @cloudbase/cli
export PATH="$HOME/.local/bin:$PATH"   # 建议写进 ~/.zshrc
cloudbase --version                    # CloudBase CLI 3.x
```

> npm 走代理时加：`HTTPS_PROXY=http://127.0.0.1:7890 npm i -g --prefix ~/.local @cloudbase/cli`。
> CLI 3.x 的命令是 `cloudbase`（旧文档里叫 `tcb`，两者等价）。

### 2. 登录（三选一）

```bash
cloudbase login                       # 推荐：浏览器/设备码授权，无需暴露密钥
cloudbase login -k                    # 交互式输入 SecretId / SecretKey
cloudbase login --apiKeyId <SecretId> --apiKey <SecretKey>   # 非交互（CI / 脚本）
cloudbase login --cloudbase-api-key <环境 API Key> -e <envId>
cloudbase logout                      # 退出并清除本机凭据
```

- 凭据保存在 `~/.config/.cloudbase/auth.json`（权限 600），**不要提交到 Git、不要发到聊天里**。
- SecretId/SecretKey 在腾讯云控制台 → 访问管理 CAM → API 密钥管理创建；SecretKey 只显示一次。
- 登录后 `cloudbase env:list` 查看环境，`cloudbase env:list --region ap-singapore` 可查其他地域。

### 3. 一键部署（本项目）

```bash
npm run deploy:cloudbase               # 自动生成干净目录 → 上传 → 校验线上版本
DRY_RUN=1 npm run deploy:cloudbase     # 只准备文件，不上传
```

默认部署到环境 `ladygaga-d2gssg68j01d8906b` 的 **`/ielts/`** 子路径（这是当前线上站点实际使用的路径，不是根目录）。可用环境变量覆盖：

```bash
CLOUDBASE_ENV_ID=xxx CLOUDBASE_PATH=ielts \
CLOUDBASE_SITE_URL=https://xxx.tcloudbaseapp.com npm run deploy:cloudbase
```

也可以手动执行：

```bash
cloudbase hosting deploy ./dist ielts -e <envId> --verify
cloudbase hosting list /ielts -e <envId>
npm run deploy:check -- https://<默认域名>/ielts
```

### 4. 默认域名的「风险提醒」是正常的

`*.tcloudbaseapp.com` 是腾讯云的**测试默认域名**：浏览器首次访问会先出现「风险提醒」中间页（点「确定访问」后进入），非页面导航请求会带 `Content-Disposition: attachment`（用 curl 看到附件头是正常现象）。要去掉中间页/附件头，需要绑定**已完成 ICP 备案的自定义域名**。详见 [默认域名访问限制及中间页](https://docs.cloudbase.net/service/alias)。

---

## 推送 GitHub

```bash
cd 雅思   # 项目根目录
git init
git add -A
git commit -m "IELTS 工作台：六大模块 + 进度导入导出"
git branch -M main
git remote add origin https://github.com/<你的用户名>/ielts-workbench.git
git push -u origin main
```

首次推送会要求 GitHub 账号密码或 Personal Access Token（需 `repo` 权限）。没有远程仓库时，先在 GitHub 网页创建空仓库（不要勾选 README），再执行上面的 `remote add` 与 `push`。

## 技术栈与许可

- 纯 HTML/CSS/JS（ES Modules），无第三方运行时依赖。
- 设计方向：白瓷气泡（白 + 天青蓝、独立气泡导航、浮岛 / bento 布局、气泡按钮、柔和投影），状态色仅用于数据与状态。
- 项目内文件按各自来源遵循相应许可；自研代码可按需选用 MIT 等许可发布。
