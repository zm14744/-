from flask import Flask, request, jsonify, render_template
import traceback
import os
import sys

# 尝试导入 ai，如果失败则给出错误处理
try:
    from ai import ask_ai
except Exception as e:
    print("❌ 导入 ai 模块失败:", e, file=sys.stderr)
    def ask_ai(messages):
        return f"❌ AI 模块加载失败: {str(e)}。请检查 ai.py 是否存在且语法正确。"

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"reply": "⚠️ 请求缺少 JSON 数据"}), 400
        messages = data.get("messages", [])
        if not messages:
            return jsonify({"reply": "⚠️ 没有消息内容"}), 400

        print(f"📩 收到 {len(messages)} 条消息")
        reply = ask_ai(messages)
        return jsonify({"reply": reply})

    except Exception as e:
        print("❌ /chat 错误:", traceback.format_exc())
        return jsonify({"reply": f"❌ 服务器内部错误: {str(e)}"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
