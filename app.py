import os
import threading
import time
from collections import defaultdict, deque

from flask import Flask, jsonify, render_template, request

from ai import ask_ai


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

    try:
        result = ask_ai(cleaned)
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

        return jsonify({
            "reply": reply
        })

    error = result.get(
        "error",
        "AI 服务暂时不可用，请稍后重试。"
    )

    return jsonify({
        "error": error
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

        return jsonify({
            "text": result.get("text", ""),
            "text_count": result.get(
                "text_count",
                0
            ),
            "formula_count": result.get(
                "formula_count",
                0
            ),
            "warning": result.get("warning"),
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

