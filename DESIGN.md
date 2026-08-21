---
name: IELTS 工作台 · 石墨矿场
description: 深色石墨数据终端风格的雅思备考控制台——发丝缝面板、语法色状态、等宽数字
colors:
  ground: "#0B0D10"
  panel: "#12151B"
  raised: "#1C212A"
  hairline: "#262C36"
  hairline-strong: "#333B47"
  text: "#E8EBEF"
  text-secondary: "#A7B1BF"
  text-muted: "#78828F"
  on-accent: "#06101F"
  accent: "#4C9EFF"
  ok: "#3ECF8E"
  warn: "#FFB454"
  bad: "#FF6369"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "14px"
    lineHeight: 1.6
  label:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.09em"
  data:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "13px"
rounded:
  sm: "4px"
  md: "7px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  huge: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    border: "1px solid {colors.hairline}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.bad}"
    rounded: "{rounded.sm}"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.md}"
    border: "1px solid {colors.hairline}"
  input:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    border: "1px solid {colors.hairline}"
---

# Design System: IELTS 工作台 · 石墨矿场

## Overview

**Creative North Star: "石墨矿场"**

每一次打卡、每一道练习、每一篇作文，都是往矿场的账本里写入一行真实记录；你的努力不靠口号，靠可回看的账目与矿脉累积。系统以深色石墨为地面，用 1px 发丝缝把信息划分为清晰的面板——像开发者控制台一样诚实、精密、可扫读。状态色是矿灯：蓝灯指路（操作）、绿灯见矿（达标）、琥珀预警（学习中）、红灯警报（破坏/错误），它们只出现在数据与状态上，绝不充当装饰。等宽数字是矿场的度量衡：所有分数、天数、倒计时都以等宽字形排布，跨面板对齐，眼睛扫过即是读数。

**Key Characteristics:**
- 石墨黑地面（#0B0D10），面板靠发丝缝与单级抬升区分，无阴影堆叠
- 语法色仅用于状态与数据：蓝/绿/琥珀/红四种，配对应低饱和底色
- 所有度量用等宽数字（tabular figures），面板标题用小号大写等宽字
- 手绘 1.4px 笔画 SVG 线框图标，无 emoji
- 破坏性操作默认描边态，聚焦/悬停才显形为实心红
- 一个方向一个动作：rise-in 入场动效只出现在页面切换，其余状态过渡克制

## Colors

石墨色的中性地面之上，四盏矿灯各自管一种语义。

### Primary
- **操作蓝**（#4C9EFF）：唯一的主操作与焦点色。主按钮、当前导航、链接、进度条、聚焦环、空状态点。任何界面一次只让一种蓝色元素当主角。

### Secondary
- **达标绿**（#3ECF8E）：目标达成——打卡达标、自测答对、已掌握词、成功提示。
- **警示琥珀**（#FFB454）：进行中或提醒——学习中状态、倒计时 ≤30 天、未达标警示。
- **破坏红**（#FF6369）：删除、错误、答错、清空数据。只出现在需要用户警惕的位置。

### Neutral
- **石墨黑**（#0B0D10）：页面地面。任何元素都站立在它之上。
- **墨底**（#0E1115）：顶栏/侧栏，比地面高一档的静态区域。
- **面板底**（#12151B）：卡片/面板主体。
- **抬升底**（#1C212A）：按钮、徽章底色，唯一的一级抬升。
- **发丝缝**（#262C36 / 强调 #333B47）：1px 分隔线、边框。
- **正文**（#E8EBEF）：主文本。
- **次级文本**（#A7B1BF）：从冷色相中调出的次级文本，绝不使用纯灰。
- **弱化文本**（#78828F）：元信息、占位符、表头。

### Named Rules
**The 矿灯 Rule.** 状态色只出现在"数据或状态"上：一个绿色徽章说明"达标"，一块蓝色填充说明"当前"。任何把状态色当装饰（彩色按钮墙、彩色卡片、彩色边框）都是违规。

**The 发丝缝 Rule.** 面板与面板之间用 1px 发丝缝与单级抬升区分，永远不用阴影堆叠层级；阴影只出现在 Toast 这种浮层上。

## Typography

**Display Font:** 系统无衬线栈（含 PingFang SC / Microsoft YaHei 中文）
**Body Font:** 同一系统栈
**Label/Mono Font:** 等宽栈（ui-monospace / SF Mono / Menlo / Consolas），用于所有数据、数字、面板标题、表头、日志

**Character:** 界面语言是"精密控制台"：正文用干净的系统无衬线保证中文可读性，数据与标签全部换等宽字形，让数字表格在视觉上形成矿场账本般的秩序感。标题靠字重与字号拉开层级，不做多余装饰。

### Hierarchy
- **Display**（700, 34px, 1.25, -0.01em）：模块页大标题，如"进度看板"。
- **Title**（700, 20px, 1.3, -0.01em）：单词卡主词、写作题目。
- **Body**（400, 14px, 1.6）：正文与控件文字，行宽控制在 65–75ch 以内。
- **Label**（600, 12px, +0.09em, 大写）：面板标题、表格表头——小号大写等宽字是"矿场标签"。
- **Data**（400, 13px, tabular）：所有数值、日期、倒计时、估分。

### Named Rules
**The 账本 Rule.** 任何数字（分数、天数、分钟、倒计时）一律等宽字形 + tabular-nums，保证跨行、跨面板对齐；不用等宽字装"科技感"——本世界中等宽就是度量衡本身。

## Layout

- 内容区最大宽 1060px，居中；桌面端左侧 208px 固定导航（图标 + 文字），主区 24–48px 呼吸间距。
- 间距刻度：4 / 8 / 12 / 16 / 24 / 32 / 48px；标题上方空间大于标题下方。
- 密度：数据面板用紧凑行距（行高 1.6，行间 8px），靠留白分组而非卡片套卡片。
- 响应式：≤860px 导航收窄为 62px 图标栏；≤640px 导航变为底部通栏（高 52px，图标居中），主区收窄、统计卡自动换行、倒计时字号降档。
- 禁止嵌套卡片；分组用发丝缝列表行，不用"卡片里套卡片"。

## Elevation & Depth

无阴影体系。层级只靠两种手段：发丝缝（区分相邻面板）与单级底色抬升（ground → panel → raised）。Toast 是唯一允许阴影的浮层（0 4px 14px rgba(0,0,0,.45)），因为它必须悬浮在矿场之上。

### Named Rules
**The 平面矿层 Rule.** 静止状态下一切表面都是平的；阴影不参与层级表达。需要"浮起来"的东西只有 Toast。

## Shapes

- 控件圆角 4px（按钮、输入框、徽章、表格元素），面板圆角 7px。
- 所有可点元素都有 1px 发丝缝边框作为"可点"的静态暗示；主按钮用实心蓝反白字。
- 图标统一 1.4px 笔画、圆头圆角、16×16 viewBox 手绘 SVG 线框，单色 currentColor。

## Components

### Buttons
- **Shape:** 圆角 4px，高 34px（小号 28px），1px 边框。
- **Primary:** 实心操作蓝（#4C9EFF）反白字（#06101F），悬停提亮 #63AFFF。
- **Ghost:** 透明底 + 发丝缝边框 + 次级文字；悬停升为正文色。
- **Danger:** 描边红字（透明底），**悬停/聚焦才变为实心红**——破坏性动作与邻居之间保留刻意空位，防误触。
- **Hover / Focus:** 背景 0.12s 缓动；`:focus-visible` 2px 操作蓝聚焦环。

### Chips / Badges
- **Style:** 圆角 999px，12px 字，前置 5px 语义色圆点，边框为语义色 40% 透明度、底色为语义色 12-14% 低饱和。
- **State:** 绿=达标/掌握，琥珀=进行中，红=错误，蓝=当前/信息。

### Cards / Panels
- **Corner Style:** 圆角 7px。
- **Background:** 面板底 #12151B，1px 发丝缝边框，无阴影。
- **Head:** 12px 等宽大写标题 + 前置语义色圆点（默认操作蓝），下接 1px 发丝缝。
- **Internal Padding:** 16px；数据行间用发丝缝分隔。

### Inputs / Fields
- **Style:** 地面底色 #0B0D10 + 1px 发丝缝 + 4px 圆角；placeholder 用弱化文本。
- **Focus:** 边框转操作蓝 + 3px 低饱和蓝色光晕（box-shadow 0 0 0 3px acc-dim）。
- **Select:** 右侧自绘下拉箭头（SVG data-URI），无原生箭头。

### Navigation
- **样式:** 图标 17px + 14px 文字，40px 高；悬停背景 2% 提亮。
- **Active:** 操作蓝文字 + 操作蓝 14% 低饱和底 + 600 字重——**不用彩色侧边条**。
- **移动端:** ≤640px 变底部通栏，52px 高，图标居中。

### Console Log（签名组件）
看板上的操作日志以等宽行呈现：时间戳（64px）| 模块标签（46px，语义色）| 消息，行间用 1px 虚线发丝缝分隔。它是"矿场账本"的直接物化。

### Block Grid（签名组件）
打卡格子图：12×12px 圆角 2px 方块，达标=实心绿，部分完成=琥珀，未进行=抬升底描边。它让"连续打卡"变成可一眼读出的矿脉。

## Do's and Don'ts

### Do:
- **Do** 用发丝缝和底色抬升表达层级，保持平面。
- **Do** 让状态色只出现在数据与状态上，且一次一个主角。
- **Do** 用等宽数字排布所有度量，保证跨面板对齐。
- **Do** 破坏性操作保持描边态直到悬停/聚焦。
- **Do** 用 12px 等宽小号大写字做面板标题与表头。

### Don't:
- **Don't** 用阴影堆叠表达面板层级。
- **Don't** 用彩色侧边条（>1px 彩色 border-left）标记状态。
- **Don't** 用 emoji 或 Unicode 符号代替图标——一律手绘 SVG 线框。
- **Don't** 用渐变文字、玻璃拟态、硬偏移阴影。
- **Don't** 用"大数字 + 小标签"的营销式 hero 指标；数据要以可扫读的面板呈现。
- **Don't** 把状态色当装饰铺满界面。
