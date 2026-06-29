from flask import Flask, request, jsonify, render_template
import requests
import os
import re

# ✅ 导入 ai.py 的 ask_ai（保留其重试、模拟、上下文能力）
from ai import ask_ai

app = Flask(__name__)

# =====================
# 首页
# =====================
@app.route("/")
def index():
    return render_template("index.html")

# =====================
# CORS 支持（保留原样）
# =====================
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response

# =====================
# 核心聊天接口（使用 ask_ai 保证上下文）
# =====================
@app.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return "", 200

    data = request.json
    messages = data.get("messages", [])

    if not messages:
        return jsonify({"reply": "❌ 没有消息"})

    # 取最后一条用户消息作为当前问题
    last_msg = messages[-1]
    if last_msg["role"] != "user":
        return jsonify({"reply": "❌ 最后一条消息不是用户"})

    user_text = last_msg["content"]
    # 历史消息为前面所有消息（保留完整上下文）
    history = messages[:-1]

    # 调用 ai.py 的 ask_ai，传入历史和当前问题
    reply = ask_ai(user_text, retries=1, history=history)

    return jsonify({"reply": reply})

if __name__ == "__main__":
    # 本地调试
    app.run(debug=True)
