"""
make_voice.py — 给立体书的每一句话生成神经网络配音 + 词级时间表（逐词高亮用）

用的是 edge-tts（微软 Edge「大声朗读」同一套神经语音，不需要账号）。
⚠️ 适合原型和作品集演示；正式商用请改用微软官方 Azure Speech（同样的声音，有免费额度）。

输出（每句一对）：
  assets/voice/<lang>/<passageId>.mp3
  assets/voice/<lang>/<passageId>.json   {"audio": "...mp3", "words": [{"text", "index", "start", "end"}]}
    index = 这个词在句子里的字符位置（字幕据此找到对应的词）；start / end 单位是秒

运行：
  python3 -m pip install --user edge-tts
  python3 tools/make_voice.py
"""

import asyncio
import json
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
# 默认给样片配音；也可以指定书稿：python3 tools/make_voice.py data/books/night-before-christmas.json
BOOK = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "data/book.json")
OUT = ROOT / "assets" / "voice"

# 每种语言、每个角色一个声音：旁白温柔，小狐狸更孩子气
VOICES = {
    "zh": {"旁白": "zh-CN-XiaoxiaoNeural", "小狐狸": "zh-CN-XiaoyiNeural", "圣诞老人": "zh-CN-YunxiNeural", "小王子": "zh-CN-XiaoyiNeural", "飞行员": "zh-CN-YunjianNeural", "_default": "zh-CN-XiaoxiaoNeural"},
    "en": {"旁白": "en-US-AriaNeural", "小狐狸": "en-US-AnaNeural", "圣诞老人": "en-US-GuyNeural", "小王子": "en-US-AnaNeural", "飞行员": "en-GB-RyanNeural", "大人们": "en-US-ChristopherNeural", "": "en-GB-RyanNeural", "_default": "en-US-AriaNeural"},
}
RATE = "-10%"      # 放慢一点，给孩子听


async def synth(text: str, voice: str, mp3: Path) -> list:
    """合成一句话，边收音频边收"词边界"事件（每个词从第几秒开始、持续多久）。"""
    communicate = edge_tts.Communicate(text, voice, rate=RATE, boundary="WordBoundary")
    words, cursor = [], 0
    with mp3.open("wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                token = chunk["text"]
                # 在原句里按顺序找到这个词的位置（字幕靠字符位置对上词）
                index = text.find(token, cursor)
                if index < 0:
                    index = cursor
                cursor = index + len(token)
                start = chunk["offset"] / 1e7                   # 100 纳秒 → 秒
                words.append({"text": token, "index": index, "start": round(start, 3),
                              "end": round(start + chunk["duration"] / 1e7, 3)})
    return words


async def main():
    book = json.loads(BOOK.read_text())
    for spread in book["spreads"]:
        for p in spread["passages"]:
            for lang, text_key in (("zh", "text"), ("en", "textEn")):
                text = p.get(text_key)
                if not text or lang not in book.get("languages", ["zh", "en"]):
                    continue    # 只读英文原文的书（如《小王子》）不生成中文配音
                voice = VOICES[lang].get(p["speaker"], VOICES[lang]["_default"])
                folder = OUT / lang
                folder.mkdir(parents=True, exist_ok=True)
                mp3 = folder / f"{p['id']}.mp3"
                words = await synth(text, voice, mp3)
                (folder / f"{p['id']}.json").write_text(json.dumps(
                    {"audio": f"assets/voice/{lang}/{p['id']}.mp3", "voice": voice, "text": text, "words": words},
                    ensure_ascii=False, indent=1))
                print(f"{lang} {p['id']:<6} {voice:<24} {len(words):>2} 个词  {text[:28]}")


asyncio.run(main())
