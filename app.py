from flask import Flask, request, jsonify, render_template
import traceback
import os

try:
    from ai import ask_ai
except Exception as e:
    print("❌ 导入 ai 模块失败:", e)
    def ask_ai(text, history=[]):
        return f"❌ AI 模块初始化失败: {str(e)}"

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
        
        text = data.get("text", "").strip()
        history = data.get("history", []) # 【核心修复】：接收并提取历史聊天记录
        
        if not text:
            return jsonify({"reply": "⚠️ 请输入内容"}), 400

        # 将完整的历史记录传递给 ask_ai
        reply = ask_ai(text, history)
        return jsonify({"reply": reply})

    except Exception as e:
        print("❌ /chat 错误:", traceback.format_exc())
        return jsonify({"reply": f"❌ 服务器内部错误: {str(e)}"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
