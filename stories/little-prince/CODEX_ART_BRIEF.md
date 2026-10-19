# Art Brief — *The Little Prince*, Book One (Magic Book)

You are generating the illustrations for an interactive "Magic Book" edition of *The Little Prince* (Dedication + Chapters 1–3). The book is an open book seen from above; the original text is typeset on the pages, and these illustrations are printed between paragraphs. Some of them animate in the app (fade in, get "drawn", rotate, reveal what is inside), so follow the technical rules exactly.

Generate **10 images**, one at a time, in the order given below. Save each as a PNG with a **transparent background** to:

```
/Users/lixiang/Desktop/Syn-Astra-work/popup-sample/assets/lp/<file name>
```

If your image tool saves files elsewhere (for example `~/.codex/generated_images/`), copy the final file into the folder above with the exact file name.

When all images are saved, run this once from the `popup-sample` folder:

```bash
python3 stories/little-prince/tools/make_book.py
```

---

## 1. Global rules (apply to every image)

- **Transparent background** (PNG with alpha). No paper texture, no frame, no border, no vignette, no drop shadow. The image is printed directly onto a cream page in the app; any background becomes an ugly box.
- **No text or letters** anywhere in the image.
- **Original character design.** Do NOT copy or imitate the 1943 original illustrations, their compositions or poses, and do NOT use the phrase "in the style of Saint-Exupéry". The character name and look are trademarked in many countries. Use only what the text describes: a small, serious boy with golden hair and a long scarf that blows in the wind.
- **One subject, centered**, with comfortable empty space around it.
- Keep the **same character and the same drawing hand** across images (use earlier images as reference when told to).

## 2. Two styles

The story itself contains two kinds of pictures, so the book uses two styles.

### Style A: the storyteller's illustrations
Used for scenes and characters. In the story, the pilot later bought paints and tried hard to draw his friend.

```
Children's book illustration for a printed storybook page. Loose, delicate watercolor washes with fine sepia ink linework, soft granulation, lots of white space, gentle and quiet mood, muted palette of sand, dusty blue, sage green and warm gold. Hand-drawn imperfection, no digital gloss, no text, no frame, no border. Isolated subject on a fully transparent background (PNG with alpha), no paper texture behind it.
```

### Style B: the narrator's own clumsy drawings
Used for Drawing Number One, Drawing Number Two, the three sheep and the box. In the text the narrator says he gave up drawing at six and never learned, so **these must look clumsy and childlike**. Do not make them skilful.

```
A simple, clumsy drawing made by an adult who never learned to draw, like a child's crayon-and-pencil drawing: wobbly graphite outlines, uneven wax-crayon fill with visible strokes, flat colors, no shading, no perspective tricks. Charming and a little awkward. No text, no frame. Isolated on a fully transparent background (PNG with alpha), no paper behind it.
```

Paste the matching style block at the start of every prompt below (shown as `[STYLE A]` / `[STYLE B]`).

---

## 3. The images (generate in this order)

### Image 1 — `ill-prince.png`
- **Style:** A · **Size:** 1024×1536 (portrait 2:3)
- **Where in the book:** Chapter 2, the first time the little prince appears at sunrise in the Sahara. It fades in when that sentence is read.
- **Prompt:**
```
[STYLE A]
A small, serious little boy standing alone, full figure, facing the viewer, with tousled golden hair and a very long pale-gold scarf lifting gently in the wind behind him. He wears a simple long coat in soft sage green, belted, and small boots. Calm, grave expression, as if he has just asked a very important question. Original character design. A faint warm sand-colored watercolor wash under his feet suggests the desert at sunrise. Portrait composition, figure centered, plenty of empty space above his head.
```
- This image defines the character. Make 3 variations and keep the best one; images 2 and 10 must match it.

### Image 2 — `ill-walker.png`
- **Style:** A · **Size:** 1024×1536 (portrait 2:3) · **Reference:** `ill-prince.png`
- **Where in the book:** Chapter 3. A small figure standing on top of a tiny planet that the child rotates with a finger. It is shown small, so it must read clearly at small size.
- **Prompt:**
```
[STYLE A]
The same little boy as in the reference image (same golden tousled hair, same very long pale-gold scarf, same sage-green coat), small full figure seen from the side, walking with determination toward the right, scarf trailing behind him. Simple shapes that stay readable at small size. His feet must touch the very bottom edge of the image (he stands on top of a planet). Portrait composition.
```

### Image 3 — `ill-drawing-1.png`
- **Style:** B · **Size:** 1536×768 (landscape 2:1)
- **Where in the book:** Chapter 1, "My Drawing Number One". Grown-ups think it is a hat.
- **Prompt:**
```
[STYLE B]
Drawing Number One: a brown boa constrictor seen from the outside that has swallowed an elephant, so its silhouette looks exactly like a man's hat: long low flat body extending left and right, one big rounded hump in the middle. Only the outer shape; nothing inside is visible. Brown crayon fill, wobbly pencil outline. Wide landscape composition, shape centered, generous empty space around it.
```

### Image 4 — `ill-drawing-2.png`
- **Style:** B · **Size:** 1536×768 (landscape 2:1) · **Edit:** start from `ill-drawing-1.png`
- **Where in the book:** Chapter 1, "My Drawing Number Two". In the app, a circle of light expands over Drawing One and reveals this image underneath, **so the snake outline must stay pixel-identical to Image 3**. Create it as an edit of Image 3, not a fresh generation.
- **Prompt (edit instruction):**
```
Keep the boa constrictor outline, size, position and colors exactly identical. Only change the inside of the snake: draw it as a cross-section so we can see a grey elephant curled up inside the snake's belly, trunk and little legs visible, a small dot eye. Same clumsy crayon-and-pencil style. Transparent background.
```

### Image 5 — `ill-sheep-sick.png`
- **Style:** B · **Size:** 1536×1024 (landscape 3:2)
- **Where in the book:** Chapter 2, the first sheep the narrator draws. It is rejected: "That one is already very sick." It appears as if being drawn, left to right.
- **Prompt:**
```
[STYLE B]
A woolly white sheep drawn clumsily: round cloud-like wool body, small dark face, four stick legs. This one looks sick and weak: droopy eyes, tilted head, a tiny cough puff near its mouth. Landscape composition, sheep centered.
```

### Image 6 — `ill-sheep-ram.png`
- **Style:** B · **Size:** 1536×1024 · **Reference:** `ill-sheep-sick.png`
- **Where in the book:** Chapter 2, second attempt: "that isn't a sheep, that's a ram. It has horns..."
- **Prompt:**
```
[STYLE B]
The same clumsy sheep drawing as the reference (same hand, same wool shape, same line quality), but this one is clearly a ram: two big curled horns on its head, a slightly proud look. Landscape composition, centered.
```

### Image 7 — `ill-sheep-old.png`
- **Style:** B · **Size:** 1536×1024 · **Reference:** `ill-sheep-sick.png`
- **Where in the book:** Chapter 2, third attempt: "That one is too old."
- **Prompt:**
```
[STYLE B]
The same clumsy sheep drawing as the reference (same hand, same wool shape, same line quality), but this one is very old: a long white beard, sagging wool, tired kind eyes, a little walking stick beside it. Landscape composition, centered.
```

### Image 8 — `ill-box.png`
- **Style:** B · **Size:** 1024×896 (about 8:7)
- **Where in the book:** Chapter 2: "This is the box. The sheep you want is inside." In the app the child draws their own sheep, which pops up and peeks out **above** the box, so the top part of the image must stay empty.
- **Prompt:**
```
[STYLE B]
A plain closed wooden crate drawn quickly with a few pencil strokes and light tan crayon, with three small round air holes in a row on the front side. Drawn hastily, slightly crooked. The box occupies only the LOWER 60% of the image; the UPPER 40% must be completely empty and transparent. Box horizontally centered.
```

### Image 9 — `ill-planet.png`
- **Style:** A · **Size:** 1024×1024 (square)
- **Where in the book:** the opening of Chapter 3. Up to this point the text has only said three things about his home: he comes from another planet, it is "so very small where I live", and "straight ahead of you, you can't go very far". The child spins this planet with a finger while the little prince (Image 2) stands on top. **It rotates, so it must be a perfect circle**, centered, touching all four edges, with nothing outside it.
- **No spoilers.** Do NOT draw volcanoes, a rose or any flower, or baobab sprouts. Those belong to later chapters (5, 7–9) and the book reveals them little by little. Use only neutral landmarks so the child can see the planet turning.
- **Prompt:**
```
[STYLE A]
A tiny round planet seen from the side as a perfect circle that fills the square image edge to edge: a soft dusty sand-and-ochre watercolor surface with gentle mottling. A few small, neutral landmarks spaced around the edge so you can tell when it turns: a small wooden crate with three air holes (the sheep's box) sitting on the edge, two or three small pebbles, and a couple of tiny tufts of grass. No volcanoes, no flowers, no trees, no character, no sky. The circle must be perfectly round and centered; everything outside the circle is transparent.
```

### Image 10 — `ill-boa-beast.png`
- **Style:** A · **Size:** 1536×1024 (landscape 3:2)
- **Where in the book:** the first illustration of Chapter 1: "a magnificent picture in a book about the virgin forest called *True Stories*", showing a boa constrictor swallowing a wild beast. In the app it breathes gently. Keep it dramatic but not gory or frightening for young children.
- **Prompt:**
```
[STYLE A]
An old adventure-book picture reimagined in watercolor: a huge boa constrictor coiling around a wild jungle cat in a dense virgin forest, dramatic but not gory or scary, the snake's body forming big graceful loops, a few large jungle leaves at the edges. It should feel like a picture from an old book of true jungle stories. Landscape composition, subject centered.
```

### (Optional) Image 11 — `cover.png`
- **Style:** A, **with a background** (the one exception) · **Size:** 888×1000
- **Prompt:**
```
Children's book cover illustration in loose watercolor with fine sepia ink lines: a deep dusty-blue night sky with scattered small stars, a tiny round planet in the upper middle with a small golden-haired boy in a sage-green coat standing on top, his very long pale-gold scarf blowing in the wind. Keep the lower third calm and empty for the title. No text, no letters.
```
- Save this one to `/Users/lixiang/Desktop/Syn-Astra-work/popup-sample/assets/greybox/lp/cover.png` (it replaces the placeholder cover).

---

## 4. Checklist before you finish

- [ ] 10 PNG files in `popup-sample/assets/lp/` with exactly these names: `ill-prince.png`, `ill-walker.png`, `ill-drawing-1.png`, `ill-drawing-2.png`, `ill-sheep-sick.png`, `ill-sheep-ram.png`, `ill-sheep-old.png`, `ill-box.png`, `ill-planet.png`, `ill-boa-beast.png`
- [ ] Every file has a real transparent background (check the alpha channel; no white or cream rectangle)
- [ ] `ill-drawing-2.png` outline matches `ill-drawing-1.png` exactly
- [ ] `ill-walker.png` is the same character as `ill-prince.png`
- [ ] The three sheep look like they were drawn by the same clumsy hand
- [ ] `ill-planet.png` is a perfect centered circle
- [ ] `ill-box.png` has the top 40% empty
- [ ] No text in any image; nothing copied from the original 1943 illustrations
- [ ] Ran `python3 stories/little-prince/tools/make_book.py` from the `popup-sample` folder
