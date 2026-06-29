from flask import Flask, request, jsonify, render_template
import requests
import os
import re

app = Flask(__name__)

# =====================
# DeepSeek 配置（保留你的）
# =====================
API_KEY = "你的deepseek key"
API_URL = "https://api.deepseek.com/v1/chat/completions"

SYSTEM_PROMPT = """你是离散数学专家。所有数学公式必须用标准 LaTeX 编写，并严格用 `$...$` 或 `$$...$$` 包裹。"""

MAX_HISTORY_ROUND = 8

ILLEGAL_LATEX = [
    (r"\\JBLOCK", ""),
    (r"IJBLOCK", ""),
    (r"Icdot", r"\\cdot"),
    (r"Itimes", r"\\times"),
    (r"\\operatomame", r"\\operatorname"),
]

def clean_latex(text: str):
    res = text
    for pattern, repl in ILLEGAL_LATEX:
        res = re.sub(pattern, repl, res)
    return res


# =====================
# ✅ 首页（必须有，不然 Render 404）
# =====================
@app.route("/")
def index():
    return render_template("index.html")


# =====================
# CORS（你原来的）
# =====================
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response


# =====================
# ✅ 核心接口（真正调用 DeepSeek）
# =====================
@app.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return "", 200

    data = request.json
    messages = data.get("messages", [])

    # 👉 转换前端格式 → DeepSeek格式
    ds_messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    for msg in messages[-MAX_HISTORY_ROUND:]:
        ds_messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })

    try:
        r = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "deepseek-chat",
                "messages": ds_messages
            },
            timeout=60
        )

        result = r.json()

        reply = result["choices"][0]["message"]["content"]

        reply = clean_latex(reply)

        return jsonify({"reply": reply})

    except Exception as e:
        return jsonify({"reply": f"❌ 错误: {str(e)}"})


if __name__ == "__main__":
    app.run(debug=True)
