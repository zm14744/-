from flask import Flask, request, jsonify, render_template
from ai import ask_ai
import traceback

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
        if not text:
            return jsonify({"reply": "⚠️ 请输入内容"}), 400

        reply = ask_ai(text)
        return jsonify({"reply": reply})

    except Exception as e:
        # 打印错误到日志（Render 会捕获）
        print("❌ /chat 路由错误:", traceback.format_exc())
        return jsonify({"reply": f"❌ 服务器内部错误: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(debug=True)
