# 2025–2026 雅思口语真题回忆 · 题库扩充清单

> 用途：本次「口语题库扩充」的唯一内容基准（single source of truth）。
> 数据来自公开的考后回忆（机经），**不是官方出版物**，题目措辞做了轻度规范化；网站在 UI 中也必须保留「非官方」提示。

## 1. 资料来源

| 来源 | 日期 | 用法 |
|---|---|---|
| [沃尔德 · 2026年10月15日雅思真题发布](http://betterdoer.com/activity/show/id/883.html) | 2026-10-15 | P1/P2/P3 各 8 套，最新 |
| [沃尔德 · 2026年9月17日雅思真题发布](http://betterdoer.com/activity/show/id/878.html) | 2026-09-17 | P1/P2/P3 各 8 套 |
| [沃尔德 · 2025年11月6日雅思真题发布](http://betterdoer.com/activity/show/id/830.html) | 2025-11-06 | P1/P2/P3 各 8 套 |
| [IELTS-Blog · Recent IELTS exams](https://www.ielts-blog.com/category/recent-ielts-exams/) | 2025–2026 | 交叉核对题型与话题 |
| [99IELTS · 2025年9-12月口语机经](http://jinan.99ielts.com/13605.html) | 2025-09 | 换题季话题分布参考 |

抓取时间：2026-11-04。回忆页面共 39 期（2025-07 ~ 2026-10），去重后得到 **164 个 Part 2 话题**、106 组 Part 1 问答块、大量 Part 3 讨论组。

## 2. 扩充目标

| Part | 现有 | 新增 | 扩充后 | 新增答案 |
|---|---|---|---|---|
| Part 1 | 150 | 60 | 210 | 60 条（60–85 词） |
| Part 2 | 60 | 30 | 90 | 30 条（170–215 词） |
| Part 3 | 120 | 60 | 180 | 60 条（90–125 词） |
| **合计** | **330** | **150** | **480** | **150 条** |

新增题目一律带 `isNew: true`（UI 显示「2026 新题」徽章，可筛选）。

## 3. 写作硬性要求（写手必读）

- **只写自己负责的两个文件**，不要改其他任何文件。
- 题目 `id` 必须与答案对象的 key **逐字一致**；`id` 全库唯一。
- Part 1 答案 60–85 词，Part 2 答案 170–215 词，Part 3 答案 90–125 词（英文词数，含缩写算 1 词）。
- 高分语言标准：Band 7.5–8.5。必须自然使用：话题词汇、搭配、复杂句（定语从句/让步状语/分词结构）、连接手段（To be honest / What makes it stand out is / Looking back / That said）、1 个具体细节（数字、地点、时间、人名或物件）。
- **禁止**：中文、`Lorem`、`TODO`、占位符、空洞套话堆砌、每段同一句式、把 Part 2 写成 4 个问题各一句的流水账。
- Part 2 答案建议结构：开场点名 → 一句 why it matters → 2–3 个具体细节（时间/人物/动作/感官）→ 影响或转变 → 收尾回扣。**不要**逐条复述题卡提示语（评分官讨厌背题卡）。
- Part 3 答案：先给立场 → 1 个原因 → 1 个例子/对比 → 一句让步或收束。答案之间不得重复同一例子（避免全库都是 "my friend Kevin"）。
- 句式与细节要多样化：写手需自查高频词重复（如每篇都以 "I'd like to talk about" 开头可以，但主体句必须不同）。
- 文件格式：

```js
// js/data/speaking-part1-2026.js
export default [
  { id: "p1-music2-01", category: "音乐", isNew: true, question: "..." },
];

// js/data/answers-speaking-p1-2026.js
export default {
  "p1-music2-01": "...",
};
```

- 交付前自查：`node scripts/verify-speaking.mjs`（Lead 提供）。脚本会检查 id 配对、词数区间、重复 id、占位符。

## 4. Part 1 新增 60 题（12 组 × 5 题）

### A. 音乐与情绪 `category: "音乐"`
1. `p1-music2-01` Do you prefer sad or happy music? Why?
2. `p1-music2-02` Does happy music make you feel more excited?
3. `p1-music2-03` Have you ever taken any music classes?
4. `p1-music2-04` Do you listen to music while doing other things? Why?
5. `p1-music2-05` Why do many people like listening to music while doing sports?

### B. 鞋子 `category: "衣服时尚"`
6. `p1-shoes-01` Which do you prefer, fashionable shoes or comfortable shoes? Why?
7. `p1-shoes-02` How much money do you usually spend on shoes?
8. `p1-shoes-03` Have you ever bought shoes online? How was the experience?
9. `p1-shoes-04` Do you like buying shoes? Why or why not?
10. `p1-shoes-05` How often do you buy new shoes?

### C. 礼貌礼仪 `category: "礼貌礼仪"`
11. `p1-polite-01` On what occasions should people be polite?
12. `p1-polite-02` What did you do to show your politeness as a child?
13. `p1-polite-03` Do you think being polite is very important? Why?
14. `p1-polite-04` How did you learn to be polite as a child?
15. `p1-polite-05` Do you think people are less polite than they used to be?

### D. 疲劳与休息 `category: "运动健康"`
16. `p1-tired-01` What do you usually do when you feel tired?
17. `p1-tired-02` When do you usually feel tired during the day?
18. `p1-tired-03` Do you often feel tired? Why?
19. `p1-tired-04` When you feel tired, do you still go out with your friends?
20. `p1-tired-05` Do you take naps during the day?

### E. 纸笔与书写 `category: "书写手工"`
21. `p1-paper-01` Do you carry paper and pens with you when you go out? Why?
22. `p1-paper-02` Do people still keep handwritten letters today?
23. `p1-paper-03` What did you like to do with paper as a child?
24. `p1-paper-04` Have you ever made any crafts with paper?
25. `p1-paper-05` Do you prefer typing or handwriting? Why?

### F. 水果蔬菜 `category: "食物烹饪"`
26. `p1-fruit-01` Do you like fruits and vegetables?
27. `p1-fruit-02` How often do you eat fruit and vegetables?
28. `p1-fruit-03` Where do you usually buy fruit and vegetables?
29. `p1-fruit-04` Were there any fruits you disliked as a child?
30. `p1-fruit-05` Do you think you eat enough fruit and vegetables?

### G. 回收与环保 `category: "环境"`
31. `p1-recycle-01` Do you recycle things in your daily life?
32. `p1-recycle-02` Did you recycle when you were a child?
33. `p1-recycle-03` Is waste sorting common in your country?
34. `p1-recycle-04` What do you do when you see rubbish on the street?
35. `p1-recycle-05` Why do some people not bother to recycle?

### H. 手表与时间 `category: "手表配饰"`
36. `p1-watch-01` Do you wear a watch? Why?
37. `p1-watch-02` Have you ever received a watch as a gift?
38. `p1-watch-03` Why do some people wear expensive watches?
39. `p1-watch-04` Do you think it is important to be on time?
40. `p1-watch-05` Do you check the time on your phone more often than on a watch?

### I. 耳机 `category: "科技使用"`
41. `p1-headphone-01` Do you often use headphones?
42. `p1-headphone-02` What type of headphones do you use?
43. `p1-headphone-03` When would you use headphones?
44. `p1-headphone-04` In what situations would you not use headphones?
45. `p1-headphone-05` Do you think wearing headphones in public places is rude?

### J. 收纳与整洁 `category: "住所"`
46. `p1-tidy-01` Do you like to keep things tidy?
47. `p1-tidy-02` How do you keep your work or study space tidy?
48. `p1-tidy-03` Do you think it is necessary to be tidy?
49. `p1-tidy-04` Did you keep your room tidy as a child?
50. `p1-tidy-05` Do you think tidiness helps you study better?

### K. 名字与记忆 `category: "记忆与名字"`
51. `p1-names-01` Do you often forget people's names?
52. `p1-names-02` How do you remember people's names?
53. `p1-names-03` Is it easy for you to remember people's names?
54. `p1-names-04` How do you feel when people can't remember your name?
55. `p1-names-05` Are you good at remembering things in general?

### L. 购物体验 `category: "购物"`
56. `p1-shopping2-01` Do you like shopping? Why?
57. `p1-shopping2-02` How often do you go shopping?
58. `p1-shopping2-03` Do you prefer online shopping or in-store shopping? Why?
59. `p1-shopping2-04` Have you ever returned anything you bought online?
60. `p1-shopping2-05` What do you usually buy when you go shopping?

## 5. Part 2 新增 30 题（2026 真题话题）

| # | id | category | 题目（题卡提示语可补全为 You should say: ...） |
|---|---|---|---|
| 1 | `p2-2026-noise-01` | 噪音与拥挤 | Describe a noisy place you have been to. |
| 2 | `p2-2026-boringplace-01` | 噪音与拥挤 | Describe a boring place you have been to. |
| 3 | `p2-2026-crowded-01` | 噪音与拥挤 | Describe a crowded place you went to. |
| 4 | `p2-2026-tallbuilding-01` | 建筑 | Describe a tall building you like or dislike. |
| 5 | `p2-2026-handcraft-01` | 人物 | Describe a person who is good at making things by hand. |
| 6 | `p2-2026-elder-01` | 人物 | Describe someone who is older than you that you admire. |
| 7 | `p2-2026-photolover-01` | 人物 | Describe a person you know who really likes taking photos. |
| 8 | `p2-2026-historybuff-01` | 人物 | Describe a person who learns history and loves history. |
| 9 | `p2-2026-creative-01` | 人物 | Describe a creative person you admire. |
| 10 | `p2-2026-helper-01` | 人物 | Describe a person who often helps others. |
| 11 | `p2-2026-businessowner-01` | 工作学习 | Describe a person you know who has a successful business. |
| 12 | `p2-2026-gardener-01` | 园艺生活 | Describe a person who loves to grow vegetables at home or in the garden. |
| 13 | `p2-2026-video-01` | 媒体 | Describe an interesting video. |
| 14 | `p2-2026-sportsevent-01` | 运动赛事 | Describe a live sports event you watched and liked. |
| 15 | `p2-2026-badmovie-01` | 媒体 | Describe your least favourite movie. |
| 16 | `p2-2026-adstar-01` | 广告营销 | Describe an advertisement with a famous person in it. |
| 17 | `p2-2026-triptire-01` | 交通 | Describe a short trip you often take but do not like. |
| 18 | `p2-2026-evening-01` | 活动习惯 | Describe an enjoyable evening you had with your friends. |
| 19 | `p2-2026-wastetime-01` | 活动习惯 | Describe an activity you do regularly that you think is a waste of time. |
| 20 | `p2-2026-festivefood-01` | 餐饮 | Describe a food that people eat on special occasions or events. |
| 21 | `p2-2026-techproblem-01` | 科技 | Describe a challenging technological problem you faced. |
| 22 | `p2-2026-techwant-01` | 科技 | Describe a piece of technology, not a phone, that you would like to own. |
| 23 | `p2-2026-recommendplace-01` | 地点 | Describe a place you have travelled to that you would like to recommend to others. |
| 24 | `p2-2026-visithome-01` | 地点 | Describe a home that you like to visit but do not want to live in. |
| 25 | `p2-2026-brokenplan-01` | 改变决定 | Describe a plan that you had to change recently. |
| 26 | `p2-2026-newlaw-01` | 规则法律 | Describe a new law you would like to introduce in your country. |
| 27 | `p2-2026-imagination-01` | 事件经历 | Describe a time when you needed to use your imagination. |
| 28 | `p2-2026-earlyrise-01` | 事件经历 | Describe a time when you got up early. |
| 29 | `p2-2026-skyview-01` | 自然景观 | Describe a time when you saw something in the sky, like flying kites, birds or a sunset. |
| 30 | `p2-2026-usefulbook-01` | 书籍阅读 | Describe a book you read that you found useful. |

> 题卡提示语写法参考现有文件：`You should say: what ... / when ... / who ... / and explain why ...`（每个话题补 3–4 条，与现有 60 题风格一致）。

## 6. Part 3 新增 60 题（12 组 × 5 题）

### A. 职业面试 `category: "工作"`
1. `p3-interview-01` What should people wear to a job interview?
2. `p3-interview-02` Why do we need to attend interviews when applying for jobs?
3. `p3-interview-03` What should people do to prepare for a job interview?
4. `p3-interview-04` Is it better to be interviewed online or face to face?
5. `p3-interview-05` Do you think interviews are a fair way to choose employees?

### B. 噪音与城市 `category: "城市生活"`
6. `p3-noise-01` How do people in your country usually respond to noise?
7. `p3-noise-02` Which area is exposed to more noise, the city or the countryside?
8. `p3-noise-03` What can cities do to reduce noise pollution?
9. `p3-noise-04` Do you think it is a good trend to have more big cities?
10. `p3-noise-05` Why do people go to crowded places?

### C. 摄影 `category: "媒体"`
11. `p3-photo-01` Why do tourists like taking photos while they are travelling?
12. `p3-photo-02` Do you think it is okay to take photos everywhere?
13. `p3-photo-03` What kind of photos do people often take?
14. `p3-photo-04` Is it a waste of time to take photos with mobile phones?
15. `p3-photo-05` Do people take too many photos instead of enjoying the moment?

### D. 代际差异 `category: "老年人"`
16. `p3-generation-01` What kinds of things do the elderly remember for a long time?
17. `p3-generation-02` Why is there a generation gap between the young and the old?
18. `p3-generation-03` Has old people's quality of life improved compared with the past?
19. `p3-generation-04` Why aren't young people willing to listen to older people's experiences?
20. `p3-generation-05` What can be done to help the young and the old understand each other better?

### E. 通勤与交通 `category: "城市生活"`
21. `p3-commute-01` What problems does rush-hour commuting cause?
22. `p3-commute-02` Which is better for knowing a country, travelling or reading books about it?
23. `p3-commute-03` Do you think air pollution comes mostly from vehicles?
24. `p3-commute-04` Do people need to change the way they travel to protect the environment?
25. `p3-commute-05` How could public transport be improved in your city?

### F. 视频与阅读 `category: "媒体"`
26. `p3-video-01` What kind of videos do people in your country like to watch?
27. `p3-video-02` Which is more helpful, watching videos or reading books?
28. `p3-video-03` What skills can people learn from watching videos?
29. `p3-video-04` Do you think reading on paper is better than reading on a screen?
30. `p3-video-05` Will videos replace books as a learning tool?

### G. 教育与无聊 `category: "教育"`
31. `p3-boringedu-01` Why do most children think education is boring?
32. `p3-boringedu-02` What can people do when they feel bored?
33. `p3-boringedu-03` Should teachers make learning fun?
34. `p3-boringedu-04` Is it a waste of time to do things that seem boring?
35. `p3-boringedu-05` How can schools make lessons more engaging?

### H. 时间与守时 `category: "时间管理"`
36. `p3-punctual-01` Why do people get up early?
37. `p3-punctual-02` What kinds of occasions require people to arrive early?
38. `p3-punctual-03` Why do some people like to stay up late?
39. `p3-punctual-04` Is it good to arrive early in any situation?
40. `p3-punctual-05` Do people in your country value punctuality?

### I. 艺术与创造力 `category: "文化"`
41. `p3-art-01` Does art, like music or theatre, have an impact on society?
42. `p3-art-02` Is it good to have creative people in a team?
43. `p3-art-03` Do children these days still like doing arts and crafts?
44. `p3-art-04` What kinds of jobs need imagination?
45. `p3-art-05` Should schools spend more time on art subjects?

### J. 规则与法律 `category: "社会"`
46. `p3-rules-01` Why do some people refuse to abide by rules?
47. `p3-rules-02` Do people in your country usually obey the law?
48. `p3-rules-03` Is punishment or reward more effective in encouraging good behaviour?
49. `p3-rules-04` Should governments introduce more laws to protect the environment?
50. `p3-rules-05` What rules should students follow at school?

### K. 科技与 AI `category: "科技"`
51. `p3-ai-01` What are the pros and cons of AI?
52. `p3-ai-02` Should students learn AI knowledge at school?
53. `p3-ai-03` Are teenagers too dependent on digital products?
54. `p3-ai-04` How has technology changed the way people communicate?
55. `p3-ai-05` Do the benefits of technology outweigh its drawbacks?

### L. 广告与消费 `category: "消费"`
56. `p3-ads-01` Why do brands use celebrity endorsements?
57. `p3-ads-02` What makes an advertisement boring?
58. `p3-ads-03` Which works better, online or offline advertising?
59. `p3-ads-04` Are advertisements good or bad for children?
60. `p3-ads-05` Why do people buy things they do not really need?

## 7. 新增分类汇总（会出现在筛选下拉里）

- Part 1 新增：礼貌礼仪、书写手工、手表配饰、记忆与名字
- Part 2 新增：噪音与拥挤、建筑、园艺生活、运动赛事、广告营销、规则法律、自然景观、书籍阅读
- Part 3 新增：时间管理

## 8. 质检脚本会检查

1. 每个新题 `id` 在 6 个数据文件内唯一；
2. `speaking-*-2026.js` 的 id 集合 == `answers-speaking-*-2026.js` 的 key 集合；
3. 答案词数落在区间内（P1 60–85 / P2 170–215 / P3 90–125）；
4. 无中文、无 `TODO/Lorem/placeholder`；
5. 答案不以同一句开头连续出现 3 次以上（多样性抽查）。
