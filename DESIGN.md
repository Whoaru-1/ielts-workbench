---
name: IELTS 工作台 · 白瓷气泡
description: 白 + 天青蓝的轻量雅思备考工作台——悬浮胶囊导航、气泡按钮、柔和投影、14 天圆点矿脉
colors:
  ground: "#F4F8FF"
  surface: "#FFFFFF"
  surface-2: "#F7FAFF"
  surface-3: "#EEF5FF"
  line: "#E6EEFB"
  line-strong: "#D3E2F7"
  ink: "#101F3C"
  ink-secondary: "#47597C"
  ink-muted: "#5C6E8C"
  accent: "#2F6BFF"
  accent-deep: "#1E56E8"
  accent-soft: "#5E97FF"
  accent-pale: "#EAF2FF"
  accent-pale-2: "#DCEAFF"
  ok: "#12BFA0"
  ok-ink: "#067A66"
  warn: "#F5A623"
  warn-ink: "#A85B00"
  bad: "#F0576E"
  bad-ink: "#C4304C"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  title:
    fontFamily: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.4
  body:
    fontFamily: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "15px"
    lineHeight: 1.65
  data:
    fontFamily: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "30px"
    fontWeight: 700
rounded:
  pill: "999px"
  xl: "28px"
  lg: "22px"
  md: "16px"
  sm: "12px"
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
    backgroundColor: "linear-gradient(135deg, #2A63F2, #245FEF 55%, #1E56E8)"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    height: "38px"
    padding: "0 16px"
  button-ghost:
    backgroundColor: "{colors.accent-pale}"
    textColor: "{colors.accent-deep}"
    rounded: "{rounded.pill}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.bad-ink}"
    rounded: "{rounded.pill}"
    border: "1px solid {colors.line-strong}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    shadow: "0 6px 18px rgba(31,70,160,.08)"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    border: "1px solid {colors.line-strong}"
---

# Design System: IELTS 工作台 · 白瓷气泡

## Overview

**Creative North Star: "白瓷气泡"**

晨光下的书桌：白瓷台面、一杯冰水、窗外晴朗的天。备考的每一分进度不该像报表，而该像一串浮在光里的气泡——能被按下去、弹回来。系统用白瓷地面（#F4F8FF）与天青蓝（#2F6BFF）的光构成世界，所有交互控件都是气泡：胶囊导航、圆形图标按钮、药丸标签、14 天圆点矿脉。层级只靠带偏移的柔和投影和白面抬升，不用描边分栏；数字保持等宽栅格对齐，让"今天做到哪"一眼可读。

**Key Characteristics:**
- 白瓷地面 + 天青蓝光；胶囊顶栏、悬浮白卡侧栏、圆角面板
- 交互即气泡：100% 圆角、上缘高光、蓝色柔影；按下收缩、松开回弹
- 柔和投影（有偏移、有模糊）表达层级；1px 线只做最轻的行分隔
- 数字用系统无衬线 + tabular-nums；等宽只留给操作日志
- 语义色：蓝=进度/操作，薄荷=成功，琥珀=部分，玫红=破坏
- 一个入场动作（bubble-in）+ 气泡按压/悬浮微动效，尊重 reduced-motion

## Colors

白色的地面之上，蓝色是唯一的主调；其余三色只在数据与状态上说话。

### Primary
- **天青蓝**（#2F6BFF）：主操作、当前导航、进度填色、聚焦环、当前日期。
- **深天青**（#1E56E8）：主按钮渐变收尾与按压色，保证白字 5:1 以上对比。
- **雾蓝**（#EAF2FF）：次级按钮底、徽章底、今日格子底。

### Secondary
- **薄荷**（#12BFA0 / 文字 #067A66）：成功——达标、答对、已掌握、已练。
- **琥珀**（#F5A623 / 文字 #A85B00）：进行中——学习中、部分完成、倒计时提醒。
- **玫红**（#F0576E / 文字 #C4304C）：破坏与错误——删除、答错、清空。

### Neutral
- **白瓷**（#F4F8FF）：页面地面，带天光渐变。
- **纯白**（#FFFFFF）：面板、悬浮导航卡、输入框。
- **雾白**（#F7FAFF / #EEF5FF）：面板内次级底、工具条、列表头。
- **墨蓝**（#101F3C）：主文本。
- **次级**（#47597C）：正文与表体。
- **弱化**（#5C6E8C）：元信息、表头、占位符（白底对比 5.1:1）。

### Named Rules
**The 气泡 Rule.** 可点击的东西必须是气泡：胶囊或圆形，带柔和投影；直角、硬边、1px 描边按钮不属于这个世界。

**The 一束光 Rule.** 蓝色一次只做一件事：当主按钮是蓝色时，导航的激活态也是蓝色，但同一屏不再出现第二种饱和色抢戏；语义色只出现在状态徽章、格子与进度上。

## Typography

**Display Font:** 系统无衬线栈（PingFang SC / Microsoft YaHei / system-ui）
**Body Font:** 同一系统栈
**Label / Data Font:** 同一系统栈，数字启用 tabular-nums；等宽栈只用于「最近操作」日志

**Character:** 轻盈、圆润、可读。中文正文用系统无衬线；标题靠字号与字重（700，30px，-0.03em）建立层级，不使用小号大写的"控制台腔"。所有分数、天数、次数用 tabular-nums 保证跨卡片对齐——数字对齐本身就是数据感。

### Hierarchy
- **Display**（700，30px，1.2，-0.03em）：模块页标题。
- **Page sub**（500，13px）：标题下的说明，弱化色。
- **Panel title**（650，13px）：面板标题，深蓝灰，前置蓝色圆点。
- **Body**（400/500，15px，1.65）：正文、列表、表单标签。
- **Stat**（700，30px，tabular）：统计气泡里的数字；首颗气泡反白。
- **Micro**（600，11.5–12px）：徽章、表头、日期、计数。

### Named Rules
**The 对齐 Rule.** 任何数字用 `font-variant-numeric: tabular-nums`；卡片并排时小数点与数位必须对齐。

## Layout

- 外壳：14px 内边距 + 14px 间隙；顶栏是 64px 高的白色胶囊，侧栏是 228px 宽的悬浮白卡，主区留白呼吸。
- 内容最大宽 1040px 居中；模块间距 22px；面板内边距 20px。
- 统计气泡自适应 4 列（≥641px），手机 2 列，≤380px 单列；卡片间距 12px。
- 列表行用 1px 浅线分隔并整行 hover 提亮，不给列表项再加卡片（禁止卡片套卡片）。
- 响应式：≤860px 侧栏收成 76px 图标悬浮栏；≤640px 变成底部悬浮胶囊（64px 高、7 个圆形入口）；≤380px 收起品牌副标。
- 段落行宽 75ch 上限。

## Elevation & Depth

三层深度，全部靠柔和投影而不是描边：
1. **地面**：白瓷渐变 + 两处极淡的蓝光圆斑。
2. **面板**：纯白 + `0 6px 18px rgba(31,70,160,.08)`。
3. **气泡**：主按钮/激活导航用 `0 8px 20px rgba(47,107,255,.30)` + 上缘 1px 白色内高光。

### Named Rules
**The 浮起 Rule.** 阴影必须有偏移和模糊；零偏移的彩色光环只是装饰。静止时面板轻浮，交互时气泡再抬起 1–2px。

## Shapes

- 胶囊 999px：按钮、徽章、标签、底部导航、顶栏。
- 面板 22–28px：侧栏 28px，统计气泡与面板 22px，输入框 16px。
- 14 天矿脉：14px 圆形气泡，达标=蓝色渐变+蓝影，部分=琥珀，未开始=雾白内描边；今天外框雾蓝。
- 图标统一手绘 SVG 线框（16 viewBox，1.4px 笔画，圆头），单色 currentColor。

## Components

### Buttons
- **Shape:** 胶囊，高 38px（小号 32px），左右 16px。
- **Primary:** 135° 蓝色渐变 + 白色内高光 + 蓝色柔影；悬停上浮 2px、阴影加深；按下收缩到 0.97 并压掉阴影。
- **Ghost:** 雾蓝底 + 深蓝文字，无描边；悬停加深。
- **Danger:** 白底细边玫红字；悬停转玫红浅底；聚焦时才实心。
- **Focus:** 主按钮/激活导航/激活标签在深色底上用白色内环 + 蓝色外环。

### Chips / Badges
- 胶囊，24px 高，11.5px 字，前置 5px 同色圆点；底色为语义色浅底，文字用对应深色，保证 4.5:1。

### Cards / Panels
- 22px 圆角、纯白、柔和投影、1px 极浅描边；面板头 16/20px 内边距 + 浅线分隔；标题 13px 深蓝灰 + 8px 蓝点（外圈雾蓝）。
- 统计气泡：首颗深蓝渐变反白，其余白卡；卡片右上角一枚极淡的蓝色气泡光斑。

### Inputs / Fields
- 纯白底、16px 圆角、1px 雾蓝边、内阴影 1px；聚焦蓝边 + 4px 30% 蓝环；搜索框与工具条选择器用胶囊形。
- Select 使用自绘 chevron（SVG data-URI）。

### Navigation
- 侧栏胶囊项 46px 高；悬停雾蓝底并上移 1px；激活为蓝色渐变胶囊 + 白字 + 蓝影，计数变成半透明白胶囊。
- 手机底部：悬浮白胶囊，6 个模块 + 设置的圆形入口，激活为 52px 蓝渐变圆气泡。

### Console Log
看板「最近操作」保留等宽日志：时间（70px）| 模块标签（46px，蓝）| 消息，行间虚线浅分隔——这是整个气泡世界里唯一的数据账本。

### Streak Bubbles（签名组件）
14 天圆点矿脉：14px 圆，达到=蓝渐变+投影，部分=琥珀，未开始=雾白内圈；今天有雾蓝底与边框，悬停看当日完成数。

## Motion

- **bubble-in**：页面切换时子元素 0.5s 上浮 12px + 轻微模糊消散，40ms 级联。
- **按压**：按钮 `translateY(1px) scale(.97)`，阴影塌陷；悬停上浮 1–2px。
- **时长**：150–200ms，缓动 `cubic-bezier(.2,.9,.25,1.1)`。
- `prefers-reduced-motion` 下全部关闭。

## Do's and Don'ts

### Do:
- **Do** 用胶囊/圆形承载所有可点元素，让"可点"由形状和投影表达。
- **Do** 用带偏移的柔和投影分层，面板轻浮、气泡可抬起。
- **Do** 让蓝色承担操作与进度；语义色只在状态上出现。
- **Do** 数字用 tabular-nums，并排卡片对齐。
- **Do** 保持留白：面板之间 22px、页边 14px，宁可少放一个元素。

### Don't:
- **Don't** 用深色地面、发丝缝分栏或等宽大字标题（旧「石墨」世界的语言）。
- **Don't** 用直角按钮、硬偏移阴影、1px 描边当主要层级手段。
- **Don't** 用渐变文字或玻璃拟态装饰。
- **Don't** 在面板里再套一层卡片；列表行只做 hover 提亮。
- **Don't** 用 emoji 代替图标；图标一律手绘 SVG。
- **Don't** 让状态色铺满界面或参与装饰。
