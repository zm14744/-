import os
import json
import re
import threading
import time
from collections import defaultdict, deque

from flask import Flask, jsonify, render_template, request

from ai import ask_ai, analyze_image_structure
from teaching import analyze_messages, analyze_question


# -----------------------------
# OCR 故障隔离
# -----------------------------
OCR_AVAILABLE = False
OCR_IMPORT_ERROR = None

try:
    from ocr import OCRError, load_models, recognize_image
    OCR_AVAILABLE = True
except Exception as exc:
    OCR_IMPORT_ERROR = repr(exc)
    print(f"OCR 模块导入失败：{OCR_IMPORT_ERROR}")

    class OCRError(Exception):
        pass

    load_models = None
    recognize_image = None



app = Flask(__name__)


# -----------------------------
# 知识图谱数据
# -----------------------------
_BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)
_KNOWLEDGE_GRAPH_PATH = os.path.join(
    _BASE_DIR,
    "knowledge_graph.json"
)


def _load_knowledge_graph():
    try:
        with open(
            _KNOWLEDGE_GRAPH_PATH,
            "r",
            encoding="utf-8"
        ) as file:
            data = json.load(file)

        if not isinstance(data, dict):
            raise ValueError("知识图谱文件格式不正确。")

        data.setdefault("version", 1)
        data.setdefault("title", "离散数学知识图谱")
        data.setdefault("description", "")
        data.setdefault("nodes", [])

        if not isinstance(data["nodes"], list):
            data["nodes"] = []

        return data

    except Exception as exc:
        print(
            f"知识图谱加载失败：{repr(exc)}"
        )
        return {
            "version": 1,
            "title": "离散数学知识图谱",
            "description": "知识图谱暂时不可用。",
            "nodes": []
        }


KNOWLEDGE_GRAPH_DATA = _load_knowledge_graph()


# -----------------------------
# 基础限制
# -----------------------------
MAX_MESSAGE_CHARS = 6000
MAX_MESSAGES_PER_REQUEST = 16

MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 单张图片最大 8MB

# multipart/form-data 本身还有少量协议开销，
# 所以 Flask 总请求上限略高于单张图片上限。
app.config["MAX_CONTENT_LENGTH"] = (
    MAX_IMAGE_BYTES + 512 * 1024
)

RATE_LIMIT_WINDOW = 60
RATE_LIMIT_CHAT = 20
RATE_LIMIT_OCR = 10


# -----------------------------
# 运行状态
# -----------------------------
_ocr_ready = False
_ocr_status = (
    "未初始化"
    if OCR_AVAILABLE
    else "不可用"
)

_rate_lock = threading.Lock()
_request_history = defaultdict(deque)


def _get_client_ip():
    forwarded = request.headers.get(
        "X-Forwarded-For",
        ""
    ).strip()

    if forwarded:
        return forwarded.split(",")[0].strip()

    return request.remote_addr or "unknown"


def _check_rate_limit(ip, route_name):
    """
    简单内存限流：
    - /chat 每分钟最多 20 次
    - /ocr  每分钟最多 10 次
    """
    limit = (
        RATE_LIMIT_CHAT
        if route_name == "chat"
        else RATE_LIMIT_OCR
    )

    key = f"{route_name}:{ip}"
    now = time.time()

    with _rate_lock:
        history = _request_history[key]

        while (
            history
            and now - history[0] > RATE_LIMIT_WINDOW
        ):
            history.popleft()

        if len(history) >= limit:
            return False

        history.append(now)
        return True


def _warm_ocr_models():
    """
    后台预热 OCR。

    普通文字模型成功即可视为 OCR 可用；
    公式模型失败时由 ocr.py 自动降级。
    """
    global _ocr_ready
    global _ocr_status

    if not OCR_AVAILABLE:
        _ocr_ready = False
        _ocr_status = "不可用"
        return

    try:
        _ocr_status = "加载中"
        model_status = load_models()

        _ocr_ready = bool(
            model_status.get("text_ready")
        )

        if model_status.get("formula_ready"):
            _ocr_status = "已就绪"
        else:
            _ocr_status = "已就绪（公式识别降级）"

        print(f"OCR 模型预热完成：{_ocr_status}")

    except Exception as exc:
        _ocr_ready = False
        _ocr_status = "加载失败"
        print(
            f"OCR 模型预热失败：{repr(exc)}"
        )


if OCR_AVAILABLE:
    threading.Thread(
        target=_warm_ocr_models,
        daemon=True
    ).start()


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({
        "error": "图片过大，请上传 8MB 以内的图片。"
    }), 413


@app.route("/")
def home():
    return render_template("index.html")



def _looks_like_exercise_request(text):
    value = str(text or "").strip()
    value = re.sub(r"\s+", "", value)

    if not value or len(value) > 90:
        return False

    return bool(
        re.search(
            r"^(?:请|麻烦|能不能|可以)?"
            r"(?:再|重新|随机|随便)?"
            r"(?:给我|帮我)?"
            r"(?:出|来)"
            r"(?:一道|一题|几道|几题)?"
            r"[^，。！？!?]{0,28}"
            r"(?:题目|题|练习)"
            r"(?:吧|。|！|!)?$",
            value
        )
        or re.search(
            r"^(?:请|麻烦|能不能|可以)?"
            r"(?:给我)?"
            r"(?:出题|来一道|再来一道|练习一下)"
            r"(?:吧|。|！|!)?$",
            value
        )
    )


_EXERCISE_ANSWER_PATTERN = re.compile(
    r"\[\[WRONGBOOK_ANSWER\]\]([\s\S]*?)\[\[/WRONGBOOK_ANSWER\]\]",
    re.IGNORECASE
)


def _split_exercise_answer(reply):
    """
    从 AI 出题回复中提取系统隐藏答案。
    返回：(用户可见回复, 最终答案)
    """
    if not isinstance(reply, str):
        return "", ""

    match = _EXERCISE_ANSWER_PATTERN.search(reply)

    if not match:
        return reply.strip(), ""

    answer = match.group(1).strip()

    visible = _EXERCISE_ANSWER_PATTERN.sub(
        "",
        reply
    ).strip()

    return visible, answer


def _looks_like_generated_question_reply(text):
    value = str(text or "").strip()

    if not value:
        return False

    if re.search(
        r"【(?:题目|练习题)】"
        r"|(?:^|\n)\s*#{1,4}\s*(?:题目|练习题)\s*(?:\n|$)"
        r"|(?:^|\n)\s*\*\*(?:题目|练习题)[:：]?\*\*"
        r"|(?:^|\n)\s*(?:题目|练习题)\s*[:：]?\s*(?:\n|$)",
        value,
        flags=re.MULTILINE
    ):
        return True

    parenthesized = re.findall(
        r"(?:^|\n)\s*[（(]\s*\d{1,2}\s*[)）]\s*\S+",
        value,
        flags=re.MULTILINE
    )

    numbered = re.findall(
        r"(?:^|\n)\s*\d{1,2}\s*[、.．]\s*\S+",
        value,
        flags=re.MULTILINE
    )

    has_problem_language = bool(
        re.search(
            r"(?:设|已知|给定|请回答|回答以下|回答下列|求|判断|写出|计算|证明)",
            value
        )
    )

    return bool(
        has_problem_language
        and (
            len(parenthesized) >= 2
            or len(numbered) >= 2
        )
    )


def _extract_generated_question(reply):
    """
    从 AI 练习回复中只提取题目本身。
    不依赖固定题型/知识点，支持单题、多小问、带/不带“题目”标题。
    """
    value = str(reply or "").strip()

    if not value:
        return ""

    heading_patterns = (
        r"【(?:题目|练习题)】",
        r"(?:^|\n)\s*#{1,4}\s*(?:题目|练习题)\s*(?:\n|$)",
        r"(?:^|\n)\s*\*\*(?:题目|练习题)[:：]?\*\*\s*",
        r"(?:^|\n)\s*(?:题目|练习题)\s*[:：]\s*",
        r"(?:^|\n)\s*(?:题目|练习题)\s*(?:\n|$)",
    )

    best = None

    for pattern in heading_patterns:
        match = re.search(pattern, value, flags=re.MULTILINE)
        if match and (best is None or match.start() < best.start()):
            best = match

    if best:
        value = value[best.end():].strip()
    else:
        start_patterns = (
            r"(?:^|\n)\s*(?=设)",
            r"(?:^|\n)\s*(?=已知)",
            r"(?:^|\n)\s*(?=给定)",
            r"(?:^|\n)\s*(?=下列)",
            r"(?:^|\n)\s*(?=在.{0,50}(?:图|集合|关系|系统|空间|序列|网络|情形)中)",
            r"(?:^|\n)\s*(?=求(?:解|证|出|$))",
            r"(?:^|\n)\s*(?=证明)",
            r"(?:^|\n)\s*(?=计算)",
            r"(?:^|\n)\s*(?=判断)",
        )

        start = None
        for pattern in start_patterns:
            match = re.search(pattern, value, flags=re.MULTILINE)
            if match and (start is None or match.start() < start.start()):
                start = match

        if start and start.start() > 0:
            prefix = value[:start.start()].strip()
            if (
                len(prefix) <= 180
                and re.search(
                    r"(?:好的|没问题|可以|这次|给你|我来|我们来|先来|出一道|练习一下|下面是)",
                    prefix
                )
            ):
                value = value[start.start():].strip()

    stop_patterns = (
        r"(?:^|\n)\s*(?:-{3,}\s*\n\s*)?(?:\*\*)?"
        r"(?:提示|思考提示|解题提示|小提示|关键提示)\s*[:：]?(?:\*\*)?",
        r"(?:^|\n)\s*(?:#{1,6}\s*)?"
        r"(?:参考答案|答案|解析|解答|详细解析|解题过程|过程)\s*[:：]?",
        r"(?:^|\n)\s*答\s*[:：]",
        r"(?:^|\n)\s*(?:你先|请先|先尝试|可以先|做完后|卡住了|如果卡住|把答案发给我|告诉我你的进度).{0,220}$",
    )

    stop_index = len(value)
    for pattern in stop_patterns:
        match = re.search(
            pattern,
            value,
            flags=re.IGNORECASE | re.MULTILINE
        )
        if match:
            stop_index = min(stop_index, match.start())

    value = value[:stop_index].strip()
    value = _EXERCISE_ANSWER_PATTERN.sub("", value).strip()

    return value[:6000]


def _clean_answer_only(text):
    """
    最后一道保险：答案区只保留“答案”，不把解析/理由混进去。
    """
    value = str(text or "").strip()

    if not value:
        return ""

    # 去掉常见开场。
    value = re.sub(
        r"^(?:好的[，,。\\s]*)?(?:以下是|最终答案(?:是|为)?)[：:\\s]*",
        "",
        value,
        flags=re.IGNORECASE
    ).strip()

    # 如果模型仍偷偷附带解析，从这些标题开始截断。
    cut_patterns = [
        r"\n\s*(?:#{1,6}\s*)?(?:解析|理由|过程|推导|说明|易错点)\s*[:：]?",
        r"\n\s*(?:因为|所以|由.+可得)\b",
    ]

    cut_index = len(value)

    for pattern in cut_patterns:
        match = re.search(pattern, value, flags=re.IGNORECASE)
        if match:
            cut_index = min(cut_index, match.start())

    return value[:cut_index].strip()


@app.route("/chat", methods=["POST"])
def chat():
    ip = _get_client_ip()

    if not _check_rate_limit(ip, "chat"):
        return jsonify({
            "error": "当前请求过于频繁，请稍后再试。"
        }), 429

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "请求格式不正确，请检查提交内容。"
        }), 400

    messages = data.get("messages")

    if not isinstance(messages, list):
        return jsonify({
            "error": "消息格式不正确，请重新发送。"
        }), 400

    if len(messages) > MAX_MESSAGES_PER_REQUEST:
        messages = messages[
            -MAX_MESSAGES_PER_REQUEST:
        ]

    cleaned = []

    for item in messages:
        if not isinstance(item, dict):
            continue

        role = item.get("role")
        content = item.get("content", "")

        if role not in ("user", "assistant"):
            continue

        if not isinstance(content, str):
            content = str(content)

        content = content.strip()

        if not content:
            continue

        if len(content) > MAX_MESSAGE_CHARS:
            return jsonify({
                "error": (
                    "单条消息过长，请控制在 "
                    f"{MAX_MESSAGE_CHARS} 个字符以内。"
                )
            }), 400

        cleaned.append({
            "role": role,
            "content": content
        })

    if not cleaned:
        return jsonify({
            "error": "没有检测到有效消息内容。"
        }), 400

    teaching = analyze_messages(cleaned)

    try:
        result = ask_ai(
            cleaned,
            teaching_context=teaching
        )
    except Exception as exc:
        # app 层最后一道保险。
        print(
            f"/chat 调用 AI 模块异常：{repr(exc)}"
        )
        return jsonify({
            "error": "AI 服务暂时出现异常，请稍后重试。"
        }), 500

    if not isinstance(result, dict):
        print(
            "AI 模块返回格式异常："
            f"{type(result).__name__}"
        )
        return jsonify({
            "error": "AI 服务返回格式异常，请稍后重试。"
        }), 500

    if result.get("ok") is True:
        reply = result.get("reply", "")

        if not isinstance(reply, str) or not reply.strip():
            return jsonify({
                "error": "AI 服务没有生成有效回答，请重新发送。"
            }), 502

        generated_answer = ""
        generated_teaching = None

        latest_user_text = ""
        for item in reversed(cleaned):
            if item.get("role") == "user":
                latest_user_text = item.get("content", "")
                break

        is_exercise_request = (
            teaching.get("mode") == "exercise"
            or _looks_like_exercise_request(
                latest_user_text
            )
            or _looks_like_generated_question_reply(
                reply
            )
        )

        generated_question = ""

        if is_exercise_request:
            reply, generated_answer = _split_exercise_answer(
                reply
            )

            generated_answer = _clean_answer_only(
                generated_answer
            )

            generated_question = _extract_generated_question(
                reply
            )

        # 即使上面的 mode 偶发漏判，只要回复本身能抽出明确题目，
        # 就让该题驱动右侧会话信息和知识图谱。
        if not generated_question and _looks_like_generated_question_reply(reply):
            generated_question = _extract_generated_question(
                reply
            )

        if generated_question:
            generated_teaching = analyze_question(
                generated_question
            )

        response = {
            "reply": reply,
            "teaching": teaching
        }

        if generated_teaching:
            response["generated_teaching"] = generated_teaching

        if generated_question:
            response["generated_question"] = generated_question

        if generated_answer:
            response["generated_answer"] = generated_answer

        return jsonify(response)

    error = result.get(
        "error",
        "AI 服务暂时不可用，请稍后重试。"
    )

    return jsonify({
        "error": error,
        "teaching": teaching
    }), 503


@app.route("/ocr", methods=["POST"])
def ocr():
    if not OCR_AVAILABLE or recognize_image is None:
        return jsonify({
            "error": "图片识别模块暂时不可用，请稍后重试。"
        }), 503

    ip = _get_client_ip()

    if not _check_rate_limit(ip, "ocr"):
        return jsonify({
            "error": "图片识别请求过于频繁，请稍后再试。"
        }), 429

    uploaded = (
        request.files.get("image")
        or request.files.get("file")
    )

    if uploaded is None:
        return jsonify({
            "error": "没有检测到图片，请重新上传。"
        }), 400

    raw = uploaded.read()

    if not raw:
        return jsonify({
            "error": "图片内容为空，请重新上传。"
        }), 400

    if len(raw) > MAX_IMAGE_BYTES:
        return jsonify({
            "error": "图片过大，请上传 8MB 以内的图片。"
        }), 413

    try:
        result = recognize_image(raw)

        # 即使后台预热曾经失败，只要本次识别成功，就同步刷新就绪状态。
        global _ocr_ready
        global _ocr_status
        _ocr_ready = True
        _ocr_status = (
            "已就绪（公式识别降级）"
            if result.get("warning")
            else "已就绪"
        )

        ocr_text = result.get("text", "")

        # OCR 负责题干与公式；Vision 只补充图、树、哈斯图、箭头、
        # 二维表格等 OCR 难以表达的结构。Vision 失败时 OCR 仍可继续使用。
        vision_result = analyze_image_structure(
            raw,
            ocr_text=ocr_text
        )

        corrected_text = ""
        visual_text = ""
        vision_warning = None

        if (
            isinstance(vision_result, dict)
            and vision_result.get("ok") is True
        ):
            corrected_text = str(
                vision_result.get("corrected_text", "")
            ).strip()

            visual_text = str(
                vision_result.get(
                    "visual_text",
                    vision_result.get("reply", "")
                )
            ).strip()

            if visual_text == "未发现需要补充的图形结构。":
                visual_text = ""
        else:
            if isinstance(vision_result, dict):
                vision_warning = vision_result.get("error")
            if not vision_warning:
                vision_warning = (
                    "图形结构理解暂时不可用，已保留文字识别结果。"
                )

        warnings = []
        if result.get("warning"):
            warnings.append(str(result.get("warning")))
        if vision_warning:
            warnings.append(str(vision_warning))

        # Vision 校对成功时优先给前端干净题干；
        # 若校对失败/为空，则完全回退普通 OCR，不影响基本识题。
        display_text = corrected_text or ocr_text

        return jsonify({
            "text": display_text,
            "visual_text": visual_text,
            "text_count": result.get(
                "text_count",
                0
            ),
            "formula_count": result.get(
                "formula_count",
                0
            ),
            "vision_used": bool(visual_text),
            "warning": "；".join(warnings) if warnings else None,
        })

    except OCRError as exc:
        return jsonify({
            "error": str(exc)
        }), 400

    except Exception as exc:
        print(
            f"/ocr 接口异常：{repr(exc)}"
        )
        return jsonify({
            "error": "题目识别暂时失败，请稍后重试。"
        }), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok"
    })


@app.route("/ready", methods=["GET"])
def ready():
    return jsonify({
        "web": "正常",
        "ocr_available": OCR_AVAILABLE,
        "ocr_ready": _ocr_ready,
        "ocr_status": _ocr_status
    })


if __name__ == "__main__":
    port = int(
        os.environ.get("PORT", 5000)
    )

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )
