from flask import Flask, render_template, request, Response
from ai import ask_ai_stream
import os

app = Flask(__name__)

# 首页
@app.route("/")
def index():
    return render_template("index.html")


# =========================
# DeepSeek 真流式接口
# =========================
@app.route("/chat_stream")
def chat_stream():

    text = request.args.get("text", "")

    if not text:
        return "请输入内容"

    def generate():
        for chunk in ask_ai_stream(text):
            yield chunk

    return Response(
        generate(),
        mimetype="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )


# OCR（保留，不影响）
"""
@app.route("/ocr", methods=["POST"])
def ocr():
    file = request.files["file"]
    text = ocr_text(file)
    return jsonify({"text": text})
"""


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
