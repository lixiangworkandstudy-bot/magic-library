"""
build_framework.py — 《小王子》Magic Book 全书框架：原文全文 + 逐段特效点

原则（用户定的）：读原文全文，不改写不简化；只在原文最适合的地方施魔法。
每个特效点用一小段法语原文"锚定"到具体段落（cNN-pNN），
等 Katherine Woods 英译本到了，再按段落对齐到英文。

运行：python3 stories/little-prince/tools/build_framework.py
输出：stories/little-prince/FRAMEWORK.md
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
CHAPTERS = json.loads((HERE / "text" / "fr" / "chapters.json").read_text())
OUT = HERE / "FRAMEWORK.md"

READ_WPM = 110   # 朗读速度（词/分钟），给孩子读会更慢

# 七种魔法
M = {
    "活": "活的画面", "应": "会回应", "说": "会说话", "藏": "藏秘密",
    "认": "认得你", "真": "连着真实世界", "咒": "你会施魔法", "静": "刻意安静",
}

# 全书分 10 卷（每卷可以单独读完）
VOLUMES = [
    ("第一卷 · 第一号画", [0, 1]),
    ("第二卷 · 请给我画一只羊", [2, 3]),
    ("第三卷 · 小小的星球", [4, 5, 6]),
    ("第四卷 · 玫瑰", [7, 8, 9]),
    ("第五卷 · 星球之旅（上）", [10, 11, 12]),
    ("第六卷 · 星球之旅（下）", [13, 14, 15]),
    ("第七卷 · 地球", [16, 17, 18, 19, 20]),
    ("第八卷 · 狐狸", [21]),
    ("第九卷 · 井", [22, 23, 24, 25]),
    ("第十卷 · 会笑的星星", [26, 27]),
]

# (章, 法语锚点, 强度 ✦大/✧小, 魔法类型, 特效设计, 为什么在这里)
EFFECTS = [
    # ---- 献词
    (0, "Je corrige donc ma dédicace", "✧", "活", "献词像被作者亲手划掉重写：A LÉON WERTH 后面一笔一笔添上 QUAND IL ÉTAIT PETIT GARÇON", "原文就在'修改献词'"),
    (0, "ont d'abord été des enfants", "✧", "认", "亲子共读提示：请大人说一件自己小时候的事", "整本书的钥匙句，留给大人"),
    # ---- 第 1 章
    (1, "Voilà la copie du dessin", "✦", "活", "书中书：一本旧书《真实的故事》打开，蟒蛇那幅画缓缓动起来（不吓人：只露出卷曲的身体）", "原文在描述一幅画"),
    (1, "six mois de leur digestion", "✧", "活", "画里的蛇慢慢呼吸、睡着，Zzz", "'睡六个月'—给画面一个状态"),
    (1, "Mon dessin numéro 1", "✦", "藏", "第一号画出现后**暂停**：'你看到了什么？'孩子说出或选择答案，书不评判、先不揭晓", "延迟判断：下一段大人们就会说出他们的答案"),
    (1, "Pourquoi un chapeau ferait-il peur", "✧", "活", "画轻轻变成一顶帽子的剪影，戴到一排大人的头上", "大人眼里它就是帽子"),
    (1, "l'intérieur du serpent boa", "✦", "藏", "魔杖的光照进第一号画：透视出肚子里的大象（第二号画）", "原文的揭晓时刻"),
    (1, "la Chine de l'Arizona", "✧", "活", "小地球仪转一下，从中国转到亚利桑那", "原文提到具体地方"),
    (1, "C'est un chapeau.", "✦", "认", "亲子共读：把第一号画给身边的大人看——'问问你的大人，他看到了什么？'", "原文里作者一直用这幅画测试大人；现在轮到孩子测试"),
    (1, "de cravates", "✧", "活", "桥牌、高尔夫球、领带一样样飘出来，大人满意地点头", "原文的幽默清单"),
    # ---- 第 2 章
    (2, "mille milles de toute terre habitée", "✧", "活", "镜头拉远：一架小飞机、一个人，四周全是沙漠", "孤独的尺度"),
    (2, "dessine-moi un mouton!", "✦", "说", "黎明，一个细小的声音从画面外传来（立体声从一侧）——孩子和飞行员一样被'叫醒'", "原文：一个小声音把我叫醒"),
    (2, "petit bonhomme tout à fait extraordinaire", "✦", "活", "朝阳里，小王子慢慢显形", "第一次见到他"),
    (2, "Je ne veux pas d'un éléphant dans un boa", "✧", "藏", "小王子一眼看穿第一号画：画里的大象对他亮起", "全书第一个'看见了'的人"),
    (2, "très malade", "✧", "应", "画的羊咳嗽、发抖；孩子可以先判断：这只行不行？", "先猜再听小王子的判断"),
    (2, "c'est un bélier", "✧", "应", "羊头上冒出两只弯角", "原文：它有角"),
    (2, "trop vieux", "✧", "应", "羊长出白胡子、拄拐杖", "原文：太老了"),
    (2, "Le mouton que tu veux est", "✦", "认", "**你的羊**：孩子在箱子里画自己的羊（画什么都算对）。这只羊会陪你走完全书", "原文：你要的羊就在里面——只有你知道它长什么样"),
    (2, "Il s'est endormi", "✧", "认", "箱子的小洞里传出你的羊的呼噜声", "原文：它睡着了"),
    # ---- 第 3 章
    (3, "tu es tombé du ciel", "✧", "活", "小飞机从天上'扑通'掉下来的小动画", "小王子的误会，好笑"),
    (3, "très joli éclat de rire", "✦", "活", "小王子的笑声 = 一串清脆的小铃铛（全书第一次出现，第 26 章会回来）", "埋下'会笑的星星'的声音"),
    (3, "sortant mon mouton de sa poche", "✧", "认", "他从口袋里拿出的，是**你画的那只羊**", "长线：你的羊"),
    (3, "une corde pour l'attacher", "✧", "应", "绳子和木桩出现，又被小王子推开", "原文：拴起来？多奇怪的想法"),
    (3, "on ne peut pas aller bien loin", "✦", "应", "小星球上一直往前走：转动星球，走一圈又回到原地", "原文：一直往前走也走不了多远"),
    # ---- 第 4 章
    (4, "à peine plus grande qu'une maison", "✦", "活", "一颗小星球和一座房子并排比大小", "尺度的惊讶"),
    (4, "l'astéroïde 3251", "✧", "活", "望远镜视野：星星变成编号", "大人用数字给星星起名"),
    (4, "à cause de son costume", "✦", "应", "同一个天文学家：点一下换衣服，台下的人从摇头变成鼓掌——内容没变，只是衣服变了", "以貌取人；延迟判断"),
    (4, "maison en briques roses", "✦", "活", "孩子听着原文，房子一笔一笔长出来：粉砖、窗台的天竺葵、屋顶的鸽子……读到'十万法郎'时，房子褪色成一张价签", "原文最好的一组对比：孩子的描述 vs 大人的数字"),
    (4, "Quel est le son de sa voix", "✧", "活", "三个问题各自变成画面：一段声波、一个游戏、一只蝴蝶", "孩子真正关心的'要紧事'"),
    (4, "Il était une fois", "✦", "活", "页面变成童话书的样子：金色的大写字母、花边", "原文：我本想像童话那样开头"),
    (4, "voir les moutons à travers les caisses", "✧", "认", "你的羊的箱子出现：飞行员看不见里面，但孩子点一下就能看到", "大人看不见，孩子看得见"),
    # ---- 第 5 章
    (5, "troupeau d'éléphants", "✦", "活", "一群大象一只叠一只挤在小星球上（好笑）", "原文：小王子被这个画面逗笑了"),
    (5, "avant de grandir, ça commence par être petit", "✦", "真", "星球上冒出小芽：分清玫瑰芽和猴面包树芽，拔掉后者。**每天来拔一次**", "原文：这是纪律问题，每天都要做"),
    (5, "question de discipline", "✧", "真", "清晨的星球梳洗：扫一扫、拔一拔", "每天的小习惯"),
    (5, "Faites attention aux baobabs", "✦", "活", "警示画面：三棵巨大的猴面包树撑裂一颗懒人的星球（缓慢、有分量）", "原文作者唯一用'说教'口吻强调的一幅画"),
    # ---- 第 6 章
    (6, "Allons voir un coucher de soleil", "✦", "应", "日落：天色一点点变暖", "原文"),
    (6, "tirer ta chaise", "✦", "应", "**拖动椅子**沿星球走几步，就能再看一次日落", "原文：只要把椅子挪几步"),
    (6, "quarante-quatre fois", "✧", "活", "日落计数 1…44", "数数"),
    (6, "tellement triste", "·", "静", "刻意安静：不加任何特效，画面只剩他坐在椅子上的剪影", "最悲伤的一句，魔法要让位"),
    # ---- 第 7 章
    (7, "Même les fleurs qui ont des épines", "✧", "活", "花茎上的刺被点亮", "问题的焦点"),
    (7, "Monsieur cramoisi", "✧", "活", "一个红脸先生埋头加数字，从来没闻过一朵花", "原文的讽刺画像"),
    (7, "millions et les millions d'étoiles", "✦", "藏", "夜空的星星一颗颗亮起，其中一颗里藏着一朵小花", "原文：只要看着星星就会幸福"),
    (7, "éclata brusquement en sanglots", "·", "静", "刻意安静：夜幕降下，飞行员放下工具", "让情绪自己发生"),
    (7, "muselière", "✧", "认", "一个小嘴套的草图出现在**你的羊**旁边（伏笔，到第 27 章揭晓）", "长线：你的羊"),
    # ---- 第 8 章
    (8, "fleurs très simples", "✧", "活", "朴素的小花早上开、晚上谢", "对比后面的玫瑰"),
    (8, "une graine apportée", "✦", "应", "等花开：花苞一层层准备。**孩子越催越不开**，安静等待，它才慢慢打开", "原文：她在绿色的房间里慢慢打扮"),
    (8, "je suis née en même temps que le soleil", "✧", "活", "太阳和她同时升起", "她的骄傲"),
    (8, "les tigres", "✧", "活", "老虎的影子出现又消失，四根刺闪光", "她的虚张声势"),
    (8, "paravent", "✦", "应", "拉开屏风，挡住风", "照顾她"),
    (8, "J'aurais dû la juger sur les actes", "✦", "藏", "这一句是隐形墨水：魔杖照到才显形", "小王子的醒悟——全书第一个'用心看'的句子"),
    # ---- 第 9 章
    (9, "migration d'oiseaux sauvages", "✦", "活", "一群野鸟用细绳把他拉上天空", "原文的离开方式"),
    (9, "ramona soigneusement ses volcans", "✦", "应", "清扫三座火山（两座活的、一座死的）", "离开前的最后一次照顾"),
    (9, "je t'aime", "·", "静", "刻意安静：只有玻璃罩上的一点光", "最重要的话不加特效"),
    (9, "chenilles", "✧", "活", "两三只毛毛虫，变成蝴蝶", "原文：要认识蝴蝶就得忍受毛毛虫"),
    # ---- 第 10 章 国王
    (10, "manteau d'hermine", "✧", "活", "国王的白鼬披风铺满整颗星球", "原文的画面"),
    (10, "bâiller", "✦", "咒", "国王命令你打哈欠——孩子真的打一个（跟做），国王满意", "全书最好玩的'命令'"),
    (10, "sept heures quarante", "✦", "真", "国王说'今晚七点四十'——书显示**今天你所在城市真实的日落时间**", "原文：要等合适的时候"),
    (10, "ambassadeur", "✧", "活", "一枚小小的大使徽章", "国王的挽留"),
    # ---- 第 11 章 爱虚荣的人
    (11, "Frappe tes mains", "✦", "咒", "孩子拍手（麦克风听到）→ 他脱帽鞠躬；一直拍他一直鞠", "原文：拍手吧"),
    # ---- 第 12 章 酒鬼
    (12, "honte", "·", "静", "整章不加特效；画面克制（不突出酒瓶）。保留原文给大人读", "原文全文保留；对孩子不渲染"),
    # ---- 第 13 章 商人
    (13, "Trois et deux font cinq", "✦", "活", "数字一串串飞出来，越堆越高", "原文：他从头到尾在加数字"),
    (13, "petites choses dorées", "✧", "活", "金色的小东西——原来是星星", "原文的谜语"),
    (13, "je possède une fleur", "✦", "应", "对比：点商人的星星什么也不发生；给小王子的花浇水，它就亮起来", "原文：拥有 vs 照顾"),
    # ---- 第 14 章 点灯人
    (14, "allume", "✦", "应", "孩子帮他点灯、熄灯；星球一分钟转一圈，越来越快", "原文：命令就是命令"),
    (14, "mille quatre cent quarante", "✧", "活", "日落快速循环 1440 次", "原文的数字"),
    (14, "ne me paraisse pas ridicule", "✧", "活", "点灯人身上的灯光变暖", "唯一不可笑的大人：他在照顾别的东西"),
    # ---- 第 15 章 地理学家
    (15, "un vieux Monsieur", "✧", "活", "一本巨大的书", "地理学家的书"),
    (15, "éphémère", "✦", "藏", "远方的玫瑰闪了一下，变淡——他第一次后悔", "原文：短暂的"),
    # ---- 第 16 章 地球
    (16, "allumeurs de réverbères", "✦", "活", "地球的夜晚：按时区，一片片大陆的灯依次亮起，像一场芭蕾", "原文最壮观的一段描写"),
    # ---- 第 17 章 蛇
    (17, "anneau couleur de lune", "✦", "活", "沙子里一个月光色的金环在动（不吓人）", "原文的蛇"),
    (17, "retrouver la sienne", "✦", "藏", "星星一颗颗亮起，其中一颗最亮——他的星星", "原文：星星亮着，是为了让每个人找到自己的那颗"),
    # ---- 第 18–20 章
    (18, "trois pétales", "✧", "活", "沙漠里一朵三瓣的小花，风吹过", "原文"),
    (19, "-Bonjour", "✦", "咒", "**回声**：孩子对着山喊 Bonjour / Hello，山把孩子自己的声音传回来", "原文：山的回声"),
    (20, "cinq mille", "✦", "活", "满园五千朵玫瑰一下子盛开", "原文：他的心碎了"),
    (20, "il pleura", "·", "静", "刻意安静：他趴在草地上", "让悲伤自己发生"),
    # ---- 第 21 章 狐狸 ★
    (21, "-Bonjour, dit le renard", "✦", "藏", "狐狸藏在苹果树下，孩子要找到它", "原文：我在这儿，在苹果树下"),
    (21, "apprivoiser", "✦", "认", "**驯服开始**：书记住你；之后每天真实地来读，狐狸就靠近一点（长线魔法）", "原文：驯服 = 建立联系"),
    (21, "champs de blé", "✦", "认", "孩子选自己头发的颜色 → 麦田变成那个颜色", "原文：你的头发是金色的，麦田会让我想起你"),
    (21, "un peu loin de moi", "✦", "真", "坐的距离：第 1 天很远，一天比一天近", "原文：每天坐近一点"),
    (21, "à la même heure", "✦", "真", "书记住你读书的时间：之后每天快到这个时间，狐狸会提前开心起来", "原文：如果你下午四点来，我三点就开始高兴"),
    (21, "Voici mon secret", "✦", "藏", "隐形墨水：'用心才能看清，本质的东西眼睛看不见'——要用魔杖（心）照亮才显形", "全书最重要的一句"),
    (21, "le temps que tu a perdu pour ta rose", "✦", "认", "玫瑰的光 = 你在这本书里真实花掉的时间（累计越久越亮）", "原文：你为她花的时间让她变得重要"),
    # ---- 第 22–23 章
    (22, "rapide illuminé", "✦", "活", "两列亮着灯的快车呼啸着交错而过", "原文"),
    (22, "Les enfants seuls savent", "✧", "活", "车窗上贴着孩子们的脸", "原文"),
    (23, "cinquante-trois minutes", "✦", "活", "计时器：省下的 53 分钟……", "原文的数字"),
    (23, "vers une fontaine", "✧", "活", "一眼清泉慢慢出现", "原文：我会慢慢走向一口泉水"),
    # ---- 第 24 章
    (24, "le désert est beau", "✦", "藏", "沙丘下面隐约有一口发光的井", "原文：它在某处藏着一口井"),
    (24, "un trésor", "✧", "藏", "飞行员童年的老房子：地下埋着宝藏", "原文的回忆"),
    (24, "Le plus important est invisible", "✦", "藏", "隐形墨水第二次出现", "呼应狐狸的秘密"),
    (24, "une lampe", "✧", "活", "熟睡的小王子身上有一盏小灯，风一吹就晃", "原文：要好好保护灯"),
    # ---- 第 25 章
    (25, "poulie", "✦", "应", "孩子摇动辘轳，水桶一点点升上来，辘轳吱呀'唱歌'", "原文：井在唱歌"),
    (25, "comme un cadeau", "✦", "活", "水桶里映着星光", "原文：这水像礼物"),
    (25, "Je crayonnai donc une muselière", "✧", "认", "飞行员给你的羊画嘴套——画得匆忙（第 27 章才发现忘了皮带）", "伏笔：第 27 章的问题"),
    # ---- 第 26 章
    (26, "des étoiles qui savent rire", "✦", "活", "满天星星发出第 3 章那种铃铛般的笑声", "原文：你会有会笑的星星"),
    (26, "cinq cents millions de grelots", "✦", "咒", "**选一颗你的星星**：点它，它会笑；它会一直留在图书馆的穹顶上", "长线：你的星星"),
    (26, "comme tombe un arbre", "·", "静", "刻意安静：没有声音，没有特效，只有沙子", "原文最庄重的一句"),
    # ---- 第 27 章
    (27, "courroie de cuir", "✦", "认", "**你的羊**到底有没有吃掉玫瑰？星星随你的想象，一会儿笑、一会儿像在哭——书不给答案", "原文最美的结尾：延迟判断"),
    (27, "Regardez le ciel", "✦", "真", "提醒孩子今晚抬头看真的星空", "原文直接对读者说"),
    (27, "le plus triste paysage du monde", "✦", "活", "最后一幅画：一颗星，两道沙丘线", "原文的最后一幅画"),
    (27, "écrivez-moi", "✦", "说", "孩子可以给飞行员'写信'（录一句话或画一幅画），存进自己的书里", "原文：如果你遇到他，请写信告诉我"),
]


def find(ch, phrase):
    """在这一章里找到包含锚点的第一个段落。"""
    for b in CHAPTERS[ch]["blocks"]:
        if b["type"] == "p" and phrase.lower() in b["text"].replace("\n", " ").lower():
            return b["id"]
    return None


def main():
    missing = []
    rows = {}
    for ch, phrase, level, kind, design, why in EFFECTS:
        pid = find(ch, phrase)
        if not pid:
            missing.append((ch, phrase))
            continue
        rows.setdefault(ch, []).append((pid, phrase, level, kind, design, why))
    if missing:
        print("找不到锚点：")
        for m in missing:
            print("  ", m)

    lines = [
        "# 小王子 · Magic Book 全书框架",
        "",
        "> 读**原文全文**，不改写、不简化；只在原文最适合的地方施魔法。",
        "> 由 `tools/build_framework.py` 生成——改特效点请改那个文件再运行，别手改这里。",
        "> 段落编号 cNN-pNN 来自法语原文（`text/fr/chapters.json`）；英文 Woods 译本到了以后按段落对齐。",
        "",
        "## 图例",
        "",
        "- ✦ 大特效：这一页的主魔法　✧ 小特效：轻轻一点　· 刻意安静：最重的句子不加特效",
        "- 魔法类型：" + "，".join(f"{k} = {v}" for k, v in M.items()),
        "- 没列出来的段落 = **安静阅读**：画面是活的（呼吸、光影），但不打断原文",
        "",
        "## 全书总览",
        "",
        "| 卷 | 原著章 | 段落 | 词数 | 朗读约 | ✦ | ✧ | · |",
        "|---|---|---|---|---|---|---|---|",
    ]
    tot = {"p": 0, "w": 0, "big": 0, "small": 0, "quiet": 0}
    for name, chs in VOLUMES:
        p = sum(1 for c in chs for b in CHAPTERS[c]["blocks"] if b["type"] == "p")
        w = sum(b.get("words", 0) for c in chs for b in CHAPTERS[c]["blocks"])
        eff = [r for c in chs for r in rows.get(c, [])]
        big = sum(1 for r in eff if r[2] == "✦")
        small = sum(1 for r in eff if r[2] == "✧")
        quiet = sum(1 for r in eff if r[2] == "·")
        for k, v in (("p", p), ("w", w), ("big", big), ("small", small), ("quiet", quiet)):
            tot[k] += v
        lines.append(f"| {name} | {', '.join(str(c) if c else '献词' for c in chs)} | {p} | {w} | {round(w / READ_WPM)} 分钟 | {big} | {small} | {quiet} |")
    lines.append(f"| **合计** | 27 章 + 献词 | {tot['p']} | {tot['w']} | {round(tot['w'] / READ_WPM)} 分钟 | {tot['big']} | {tot['small']} | {tot['quiet']} |")
    lines += [
        "",
        "特效密度：平均每 " + str(round(tot["w"] / max(1, tot["big"] + tot["small"]))) + " 个词一个特效点——大部分时间是安静读原文。",
        "",
        "## 三条长线魔法",
        "",
        "| 长线 | 起点 | 经过 | 终点 |",
        "|---|---|---|---|",
        "| 🐑 你的羊 | 第 2 章：在箱子里画你的羊 | 第 3、4、7、25 章 | 第 27 章：它有没有吃掉玫瑰？ |",
        "| 🦊 驯服狐狸 | 第 21 章：请驯服我 | 真实的每一天 | 狐狸记得你读书的时间 |",
        "| ⭐ 你的星星 | 第 3 章：他的笑声像铃铛 | 第 7、17 章：星星里藏着花 | 第 26 章：选一颗会笑的星星，留在图书馆穹顶 |",
        "",
        "---",
        "",
    ]
    for name, chs in VOLUMES:
        lines += [f"## {name}", ""]
        for c in chs:
            blocks = CHAPTERS[c]["blocks"]
            ps = [b for b in blocks if b["type"] == "p"]
            imgs = [b for b in blocks if b["type"] == "illustration"]
            w = sum(b["words"] for b in ps)
            title = "献词 · Dédicace" if c == 0 else f"原著第 {c} 章"
            lines += [f"### {title}",
                      "",
                      f"{len(ps)} 段 · {w} 词 · 朗读约 {max(1, round(w / READ_WPM))} 分钟 · 原书插图 {len(imgs)} 幅"
                      + (f"（位置：{', '.join('在 ' + i['after'] + ' 之后' for i in imgs)}）" if imgs else ""),
                      ""]
            eff = sorted(rows.get(c, []), key=lambda r: r[0])
            if eff:
                lines += ["| 段落 | 原文锚点 | | 魔法 | 特效设计 | 为什么在这里 |", "|---|---|---|---|---|---|"]
                for pid, phrase, level, kind, design, why in eff:
                    lines.append(f"| {pid} | *{phrase}* | {level} | {M[kind]} | {design} | {why} |")
            else:
                lines.append("（整章安静阅读）")
            lines.append("")
    OUT.write_text("\n".join(lines))
    print(f"写出 {OUT.relative_to(HERE.parent.parent)}：{sum(len(v) for v in rows.values())} 个特效点")


main()
