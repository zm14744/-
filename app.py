from flask import Flask, request, jsonify, render_template
import traceback

# 尝试导入 ai 模块，如果失败则给出清晰错误
try:
    from ai import ask_ai
except ImportError as e:
    print("❌ 导入 ai 模块失败:", e)
    # 定义一个备用函数，返回错误信息
    def ask_ai(text):
        return f"❌ AI 模块导入失败: {str(e)}，请检查 ai.py 文件是否存在且语法正确。"
except Exception as e:
    print("❌ 初始化 ai 模块时发生错误:", e)
    def ask_ai(text):
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
        if not text:
            return jsonify({"reply": "⚠️ 请输入内容"}), 400

        reply = ask_ai(text)
        return jsonify({"reply": reply})

    except Exception as e:
        print("❌ /chat 路由错误:", traceback.format_exc())
        return jsonify({"reply": f"❌ 服务器内部错误: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(debug=True)
