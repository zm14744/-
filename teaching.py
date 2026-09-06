import re


MODE_LABELS = {
    "hint": "提示引导",
    "full_solution": "完整解析",
    "concept": "概念讲解",
    "exercise": "练习出题",
    "check_answer": "答案诊断",
}


# 第 7 步先采用轻量、可解释的规则分类。
# 这里不额外调用大模型，因此不会增加一次 API 请求，也便于后续把这些标签
# 稳定地接到知识图谱、错题本和掌握度统计上。
CATEGORY_RULES = {
    "命题逻辑": {
        "keywords": [
            "命题", "真值表", "真值", "逻辑联结词", "否定", "合取", "析取",
            "蕴含", "逻辑等价", "等值", "主析取", "主合取", "析取范式",
            "合取范式", "永真", "永假", "推理规则", "逻辑推理",
        ],
        "points": {
            "命题与真值": ["命题", "真值", "永真", "永假"],
            "逻辑联结词": ["逻辑联结词", "否定", "合取", "析取", "蕴含"],
            "真值表": ["真值表"],
            "逻辑等价": ["逻辑等价", "等值", "等价式"],
            "范式": ["析取范式", "合取范式", "主析取", "主合取", "范式"],
            "命题推理": ["推理规则", "逻辑推理", "前提", "结论"],
        },
    },
    "谓词逻辑": {
        "keywords": [
            "谓词", "量词", "全称量词", "存在量词", "辖域", "自由变元",
            "约束变元", "个体域", "谓词公式", "量词否定",
        ],
        "points": {
            "谓词与个体域": ["谓词", "个体域"],
            "量词": ["量词", "全称量词", "存在量词"],
            "变元与辖域": ["辖域", "自由变元", "约束变元"],
            "量词推理与否定": ["量词否定", "谓词公式"],
        },
    },
    "集合与关系": {
        "keywords": [
            "集合", "子集", "幂集", "笛卡尔积", "关系", "二元关系", "自反",
            "反自反", "对称", "反对称", "传递", "等价关系", "等价类", "划分",
            "偏序", "全序", "哈斯图", "闭包", "关系矩阵",
        ],
        "points": {
            "集合运算": ["集合", "子集", "幂集", "并集", "交集", "差集", "补集"],
            "笛卡尔积与关系": ["笛卡尔积", "二元关系", "关系矩阵"],
            "关系性质": ["自反", "反自反", "对称", "反对称", "传递"],
            "等价关系与划分": ["等价关系", "等价类", "划分"],
            "偏序关系": ["偏序", "全序", "哈斯图"],
            "关系闭包": ["自反闭包", "对称闭包", "传递闭包", "闭包"],
        },
    },
    "函数": {
        "keywords": [
            "函数", "映射", "单射", "满射", "双射", "复合函数", "复合映射",
            "逆函数", "原像", "定义域", "值域",
        ],
        "points": {
            "函数与映射": ["函数", "映射", "定义域", "值域"],
            "单射满射双射": ["单射", "满射", "双射"],
            "复合函数": ["复合函数", "复合映射"],
            "逆函数": ["逆函数", "原像"],
        },
    },
    "计数与组合": {
        "keywords": [
            "排列", "组合", "排列数", "组合数", "二项式", "二项式定理", "鸽巢",
            "鸽巢原理", "抽屉原理", "容斥", "容斥原理", "计数", "加法原理",
            "乘法原理", "多重集合", "生成函数",
        ],
        "points": {
            "基本计数原理": ["计数", "加法原理", "乘法原理"],
            "排列与组合": ["排列", "组合", "排列数", "组合数"],
            "二项式定理": ["二项式", "二项式定理"],
            "鸽巢原理": ["鸽巢", "鸽巢原理", "抽屉原理"],
            "容斥原理": ["容斥", "容斥原理"],
            "生成函数": ["生成函数"],
        },
    },
    "递推关系": {
        "keywords": [
            "递推", "递推关系", "递归关系", "特征方程", "齐次递推",
            "非齐次递推", "初始条件", "递推式",
        ],
        "points": {
            "递推关系建模": ["递推", "递推关系", "递归关系", "递推式"],
            "线性齐次递推": ["齐次递推", "特征方程"],
            "非齐次递推": ["非齐次递推"],
            "初始条件": ["初始条件"],
        },
    },
    "图论": {
        "keywords": [
            "图论", "无向图", "有向图", "顶点", "边集", "邻接", "邻接矩阵",
            "关联矩阵", "度数", "路径", "回路", "圈", "连通", "连通分量",
            "欧拉", "哈密顿", "最短路", "dijkstra", "着色", "平面图", "匹配",
            "拉普拉斯矩阵", "laplacian", "邻接表", "树", "生成树", "最小生成树",
            "矩阵树定理", "matrix-tree", "matrix tree", "kirchhoff", "基尔霍夫",
            "kruskal", "prim", "根树", "二叉树", "叶子", "割边", "桥", "生成森林",
        ],
        "points": {
            "图的基本概念": ["无向图", "有向图", "顶点", "边集", "度数", "图论"],
            "邻接矩阵": ["邻接矩阵", "邻接表", "a^2", "tr(a^2)", "tr(a²)"],
            "图的矩阵表示": ["关联矩阵", "拉普拉斯矩阵", "laplacian"],
            "路径与连通性": ["路径", "回路", "圈", "连通", "连通分量"],
            "欧拉图": ["欧拉", "欧拉路", "欧拉回路"],
            "哈密顿图": ["哈密顿", "哈密顿路", "哈密顿回路"],
            "最短路": ["最短路", "dijkstra"],
            "图着色": ["着色", "色数"],
            "平面图": ["平面图", "欧拉公式"],
            "图匹配": ["匹配", "完美匹配"],
            "树的基本性质": ["根树", "二叉树", "叶子", "割边", "桥"],
            "生成树": ["生成树", "生成森林"],
            "最小生成树": ["最小生成树", "kruskal", "prim"],
            "矩阵树定理": ["矩阵树定理", "matrix-tree", "matrix tree", "kirchhoff", "基尔霍夫"],
        },
    },
    "代数结构": {
        "keywords": [
            "代数系统", "代数结构", "半群", "幺半群", "群", "子群", "循环群",
            "陪集", "拉格朗日定理", "同态", "同构", "环", "域", "格", "布尔代数",
        ],
        "points": {
            "代数系统": ["代数系统", "代数结构", "半群", "幺半群"],
            "群与子群": ["群", "子群", "循环群", "陪集", "拉格朗日定理"],
            "同态与同构": ["同态", "同构"],
            "环与域": ["环", "域"],
            "格与布尔代数": ["格", "布尔代数"],
        },
    },
}


NO_SOLUTION_PATTERNS = [
    "不要给我答案", "别给我答案", "不要直接给答案", "别直接给答案",
    "不要完整解析", "不用完整解析", "只给提示", "只提示", "给我提示", "提示一下",
]

FULL_SOLUTION_PATTERNS = [
    "给我答案", "直接给答案", "直接答案", "完整解析", "完整解答", "详细解答",
    "完整过程", "直接解出来", "直接做出来", "告诉我最终答案", "最终答案", "把答案给我",
]

EXERCISE_PATTERNS = [
    "出题", "生成练习题", "给我一道题", "给几道题", "练习题", "随机出题",
]

CHECK_PATTERNS = [
    "我的答案", "我算", "我做", "我写", "我觉得", "我认为", "对不对", "正确吗",
    "有没有错", "哪里错", "帮我检查", "检查一下", "为什么错", "我这样做", "我这样算",
]

CONCEPT_PATTERNS = [
    "什么是", "是什么意思", "定义", "概念", "含义", "区别", "解释一下", "怎么理解",
]

PROBLEM_PATTERNS = [
    "求", "计算", "证明", "判断", "已知", "设", "列出", "写出", "求解", "试求",
]


_INTERNAL_IMAGE_MARKERS = (
    "[图片识题]",
    "【题干与公式识别】",
    "【图形结构识别】",
)


def _normalize(text):
    value = str(text or "").strip().lower()
    value = value.replace("（", "(").replace("）", ")")
    value = value.replace("²", "^2")
    value = re.sub(r"\s+", " ", value)
    return value


def _contains_any(text, patterns):
    return any(pattern.lower() in text for pattern in patterns)


def _detect_mode(latest_text):
    text = _normalize(latest_text)

    # 否定式要求优先级必须高于“给我答案”等子串，避免
    # “不要给我答案”被误判为完整解析。
    if _contains_any(text, NO_SOLUTION_PATTERNS):
        return "hint"
    if _contains_any(text, FULL_SOLUTION_PATTERNS):
        return "full_solution"
    if _contains_any(text, EXERCISE_PATTERNS):
        return "exercise"
    if _contains_any(text, CHECK_PATTERNS):
        return "check_answer"
    if any(marker.lower() in text for marker in _INTERNAL_IMAGE_MARKERS):
        return "hint"
    if _contains_any(text, CONCEPT_PATTERNS) and not _contains_any(text, PROBLEM_PATTERNS):
        return "concept"
    return "hint"


def _detect_question_type(text, mode):
    normalized = _normalize(text)

    if mode == "exercise":
        return "出题请求"
    if mode == "concept":
        return "概念题"
    if mode == "check_answer":
        return "答案检查"
    if "证明" in normalized:
        return "证明题"
    if "判断" in normalized or "是否" in normalized:
        return "判断题"
    if any(keyword in normalized for keyword in (
        "计算", "求", "写出", "列出", "det(", "行列式", "矩阵", "最短路", "生成树"
    )):
        return "计算题"
    return "综合题"


def _keyword_weight(keyword):
    # 更长、更具体的术语权重更高，减轻“群”“树”等短词误触发。
    length = len(keyword)
    if length >= 6:
        return 5
    if length >= 4:
        return 3
    if length >= 2:
        return 2
    return 1


def _score_categories(text):
    normalized = _normalize(text)
    scores = {}

    for category, rule in CATEGORY_RULES.items():
        score = 0
        for keyword in rule["keywords"]:
            if keyword.lower() in normalized:
                score += _keyword_weight(keyword)
        scores[category] = score

    return scores


def _extract_points(text, category):
    normalized = _normalize(text)
    rule = CATEGORY_RULES.get(category)
    if not rule:
        return []

    scored = []
    for point, keywords in rule["points"].items():
        hit_score = sum(
            _keyword_weight(keyword)
            for keyword in keywords
            if keyword.lower() in normalized
        )
        if hit_score:
            scored.append((hit_score, point))

    scored.sort(key=lambda item: (-item[0], item[1]))
    return [point for _score, point in scored[:4]]


def _classify_content(text):
    scores = _score_categories(text)
    ordered = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    primary, top_score = ordered[0] if ordered else ("待识别", 0)

    if top_score <= 0:
        return {
            "category": "待识别",
            "related_categories": [],
            "knowledge_points": [],
            "confidence": "低",
            "score": 0,
        }

    second_score = ordered[1][1] if len(ordered) > 1 else 0

    related = [
        category
        for category, score in ordered[1:]
        if score > 0 and score >= max(3, int(top_score * 0.55))
    ][:2]

    if top_score >= 9 or (top_score >= 6 and top_score >= second_score + 3):
        confidence = "高"
    elif top_score >= 3:
        confidence = "中"
    else:
        confidence = "低"

    return {
        "category": primary,
        "related_categories": related,
        "knowledge_points": _extract_points(text, primary),
        "confidence": confidence,
        "score": top_score,
    }


def _is_image_input(text):
    lowered = str(text or "").lower()
    return any(marker.lower() in lowered for marker in _INTERNAL_IMAGE_MARKERS)


def analyze_question(text):
    """分析单条题目文本，主要用于测试和独立调用。"""
    mode = _detect_mode(text)
    classified = _classify_content(text)

    result = {
        "category": classified["category"],
        "related_categories": classified["related_categories"],
        "knowledge_points": classified["knowledge_points"],
        "question_type": _detect_question_type(text, mode),
        "mode": mode,
        "mode_label": MODE_LABELS[mode],
        "confidence": classified["confidence"],
        "input_source": "图片识题" if _is_image_input(text) else "文本输入",
    }

    return result


def analyze_messages(messages):
    """
    结合最近对话分析当前教学状态。

    关键点：
    - “教学模式”只看学生本轮最新要求，避免历史里的“给我答案”污染当前意图。
    - “知识点/题型”若本轮只是“继续”“给我完整解析”等短跟进，则继承最近一道
      有明确离散数学主题的用户问题，避免右侧信息突然变成“待识别”。
    """
    if not isinstance(messages, list):
        return analyze_question("")

    user_messages = []
    for item in messages:
        if not isinstance(item, dict) or item.get("role") != "user":
            continue
        content = item.get("content", "")
        if not isinstance(content, str):
            content = str(content)
        content = content.strip()
        if content:
            user_messages.append(content)

    if not user_messages:
        return analyze_question("")

    latest = user_messages[-1]
    mode = _detect_mode(latest)

    latest_classified = _classify_content(latest)
    classification_text = latest
    classified = latest_classified

    # 如果本轮只是短跟进且没有可靠主题，则向前继承最近一个可识别题目。
    if latest_classified["score"] < 3:
        for previous in reversed(user_messages[:-1]):
            previous_classified = _classify_content(previous)
            if previous_classified["score"] >= 3:
                classification_text = previous
                classified = previous_classified
                break

    input_source = (
        "图片识题"
        if _is_image_input(classification_text) or _is_image_input(latest)
        else "文本输入"
    )

    return {
        "category": classified["category"],
        "related_categories": classified["related_categories"],
        "knowledge_points": classified["knowledge_points"],
        "question_type": _detect_question_type(classification_text, mode),
        "mode": mode,
        "mode_label": MODE_LABELS[mode],
        "confidence": classified["confidence"],
        "input_source": input_source,
    }


def teaching_prompt(context):
    """把确定性分类结果转换为本轮 AI 的教学控制提示。"""
    context = context or {}
    category = context.get("category") or "待识别"
    related = context.get("related_categories") or []
    points = context.get("knowledge_points") or []
    question_type = context.get("question_type") or "综合题"
    mode = context.get("mode") or "hint"
    mode_label = context.get("mode_label") or MODE_LABELS["hint"]
    confidence = context.get("confidence") or "低"
    input_source = context.get("input_source") or "文本输入"

    points_text = "、".join(points) if points else "暂未可靠识别"
    related_text = "、".join(related) if related else "无"

    mode_instruction = {
        "hint": (
            "默认只做提示式辅导：先说明关键知识点，再给1到2个下一步提示；"
            "不要直接给最终答案或完整推导，最后可用一个问题引导学生继续。"
        ),
        "full_solution": (
            "学生已明确要求完整答案，可以给出完整、分步且可核验的解答。"
        ),
        "concept": (
            "这是概念理解请求，可以直接解释概念，并配一个简短例子；不必强行使用提示模式。"
        ),
        "exercise": (
            "学生要求生成练习，只给题目，不附答案和解析；除非本轮同时明确要求答案。"
        ),
        "check_answer": (
            "学生在检查自己的作答。优先指出正确之处、错误类型和最早出错位置，"
            "先给纠正方向，不自动把整题完整答案全部展开。"
        ),
    }.get(mode, "采用提示式辅导，不直接替学生完成整道题。")

    return (
        "\n\n【本轮教学分析（系统内部控制信息）】\n"
        f"输入来源：{input_source}\n"
        f"所属模块：{category}\n"
        f"相关模块：{related_text}\n"
        f"问题类型：{question_type}\n"
        f"知识点：{points_text}\n"
        f"教学模式：{mode_label}\n"
        f"分类置信度：{confidence}\n"
        f"执行要求：{mode_instruction}\n"
        "分类结果只是教学辅助信号，不是事实来源。若分类与题目实际内容冲突，"
        "必须以题目内容为准，不得为了迎合标签而编造知识点。"
    )
