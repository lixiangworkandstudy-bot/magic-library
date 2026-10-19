# 《小王子》第一册 · 插图 Codex Prompt

> 出好的图存到 `popup-sample/assets/lp/`，**文件名照下表**（透明底 PNG）。
> 然后运行 `python3 stories/little-prince/tools/make_book.py`，刷新页面就换成正式插图（没出的图继续用灰盒）。

## 两种画风（故事里本来就有两种画）

1. **A · 飞行员后来画的插图**（他长大后买了颜料，努力画出朋友的样子）：淡水彩 + 细墨线，大量留白。
2. **B · 书里"我"画的画**（第一号画、第二号画、三只羊、箱子）：原文说他六岁后就没学过画画，所以要画得**笨拙、简单，像孩子用蜡笔/铅笔画的**——这是故事的一部分，不能画得太好。

## 版权注意

- 不要临摹 1943 年原版插图的构图和姿势，也不要在 prompt 里写 "in the style of Saint-Exupéry"——角色形象在多国有商标。我们用自己的设计：保留"金发、长围巾、小小的、孤独"这些原文写到的特征，造型和配色是我们的。
- 原文写到的特征（可以用）：金色头发、在风里飘的长围巾（原文第 7 章 "golden hair"）、小小的个子、很严肃又会笑。

---

## 通用风格块（每张都先贴这一段）

**A 风格（故事插图）**
```
Children's book illustration for a printed storybook page. Loose, delicate watercolor washes with fine sepia ink linework, soft granulation, lots of white space, gentle and quiet mood, muted palette of sand, dusty blue, sage green and warm gold. Hand-drawn imperfection, no digital gloss, no text, no frame, no border. Isolated subject on a fully transparent background (PNG with alpha), no paper texture behind it, no shadow on the ground except a faint watercolor wash where noted.
```

**B 风格（"我"画的画）**
```
A simple, clumsy drawing made by an adult who never learned to draw, like a child's crayon-and-pencil drawing: wobbly graphite outlines, uneven wax-crayon fill with visible strokes, flat colors, no shading, no perspective tricks. Charming and a little awkward. No text, no frame. Isolated on a fully transparent background (PNG with alpha), no paper behind it.
```

---

## 插图清单

### 1. `ill-boa-beast.png` · 第 1 章开头，书里那幅"蟒蛇吞猛兽"的画 · A 风格 · 横版 3:2
```
[A 风格块]
An old encyclopedia-style engraving reimagined in watercolor: a huge boa constrictor coiling around a wild jungle cat in a dense virgin forest, dramatic but not gory, the snake's body forming big loops, a few jungle leaves at the edges. Feels like a picture from an old adventure book called "True Stories". Landscape composition, subject centered.
```

### 2. `ill-drawing-1.png` · 第一号画（大人们以为是帽子）· B 风格 · 横版 2:1
```
[B 风格块]
Drawing Number One: a brown boa constrictor seen from the outside that has swallowed an elephant, so its silhouette looks exactly like a man's hat — a long low body on the left and right, a big rounded hump in the middle. Only the outer shape, nothing inside visible. Brown crayon fill, wobbly pencil outline. Wide landscape composition, shape centered, generous empty space around it.
```

### 3. `ill-drawing-2.png` · 第二号画（蛇的剖面，肚子里的大象）· B 风格 · 横版 2:1
```
[B 风格块]
Drawing Number Two: the exact same boa constrictor outline as Drawing Number One (same hat-like silhouette, same size and position), but now drawn as a cross-section so you can see inside: a grey elephant curled up inside the snake's belly, its trunk and little legs visible, a small dot eye. Brown crayon snake outline, grey crayon elephant. Wide landscape composition.
```
> ⚠️ 这张最好**用第 2 张做"图生图 / 编辑"**：上传 `ill-drawing-1.png`，说 "keep the outline identical, show the elephant inside"。两张轮廓必须重合，"光照进去"的透视效果才自然。

### 4. `ill-prince.png` · 第 2 章，小王子第一次出现 · A 风格 · 竖版 2:3
```
[A 风格块]
A small, serious little boy standing alone, full figure, facing the viewer, with tousled golden hair and a very long pale-gold scarf lifting gently in the wind behind him. He wears a simple long coat in soft sage green, belted, and small boots. Calm, grave expression, as if he has just asked a very important question. Our own original character design. A faint warm sand-colored watercolor wash under his feet suggests the desert at sunrise. Portrait composition, figure centered, plenty of white space above.
```

### 5–7. 三只被拒绝的羊 · B 风格 · 横版 3:2
**先出 5，再用 5 做"图生图"出 6、7**，保证三只是同一个人画的。

`ill-sheep-sick.png`
```
[B 风格块]
A woolly white sheep drawn clumsily, cloud-like round wool body, small dark face, four stick legs. This one looks sick and weak: droopy eyes, tilted head, a tiny cough puff near its mouth. Landscape composition, sheep centered.
```
`ill-sheep-ram.png`
```
[B 风格块] (same sheep drawing style as the previous image)
The same clumsy sheep drawing, but this one is clearly a ram: two big curled horns on its head, a slightly proud look. Landscape composition, centered.
```
`ill-sheep-old.png`
```
[B 风格块] (same sheep drawing style as the previous images)
The same clumsy sheep drawing, but this one is very old: a long white beard, sagging wool, tired kind eyes, a little walking stick beside it. Landscape composition, centered.
```

### 8. `ill-box.png` · 箱子（"你要的羊就在里面"）· B 风格 · 近方形 8:7
```
[B 风格块]
A plain closed wooden crate drawn quickly with a few pencil strokes and light tan crayon, three small round air holes in a row on the front side. Drawn hastily, slightly crooked. Place the box in the LOWER 60% of the image and leave the upper 40% completely empty and transparent (a drawn sheep will peek out above it). Near-square composition.
```

### 9. `ill-planet.png` · 第 3 章，他的小星球（会被手指转动）· A 风格 · 正方形 1:1
> ⚠️ 不要画火山、玫瑰、嫩芽——那些是第 5、7–9 章才出现的，第 3 章只知道"很小很小、一直往前走也走不远"。标记物只用第 3 章已出现的东西：装羊的箱子、几块石子、几簇草。
```
[A 风格块]
A tiny round planet seen from the side as a perfect circle that fills the frame edge to edge: soft dusty sand-and-ochre watercolor surface. A few small neutral landmarks around the edge: a small wooden crate with three air holes (the sheep's box), two or three pebbles, a couple of tiny grass tufts. No volcanoes, no flowers, no trees, no character, no sky. Perfectly round and centered; transparent outside the circle.
```

### 10. `ill-walker.png` · 站在星球顶上的小王子（小尺寸）· A 风格 · 竖版 2:3
```
[A 风格块]
The same little boy as in ill-prince.png (golden tousled hair, very long pale-gold scarf, sage-green coat), small full figure seen from the side, walking with determination toward the right, scarf trailing behind. Simple, readable at small size. Feet at the very bottom edge of the image (he will stand on top of the planet). Portrait composition.
```
> 用第 4 张做参考图（图生图），保证是同一个角色。

### （可选）`cover.png` · 第一册封面 · A 风格 · 竖版 888:1000
```
[A 风格块, but with a background]
Book cover illustration: a deep dusty-blue night sky with scattered small stars, a tiny round planet in the upper middle with the little golden-haired boy standing on top, his long scarf in the wind. Leave the lower third calm and empty for the title text. No text in the image.
```

---

## 出图顺序建议

1. 先出 **4（小王子）**，定下角色；不满意就多出几张选一张
2. 用 4 做参考出 **10（小人儿）**
3. 出 **2（第一号画）**，再编辑出 **3（第二号画）**——两张轮廓必须重合
4. 出 **5**，再用它编辑出 **6、7**
5. **8、9、1** 随意顺序

## 放进项目

1. 存到 `popup-sample/assets/lp/`，文件名照上面
2. 运行：`python3 stories/little-prince/tools/make_book.py`
3. 刷新页面
