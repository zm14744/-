from flask import Flask, request, jsonify, render_template
from ai import ask_ai

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.json
        text = data.get("text", "")
        if not text:
            return jsonify({"reply": "⚠️ 请输入内容"}), 400

        reply = ask_ai(text)
        return jsonify({"reply": reply})

    except Exception as e:
        return jsonify({"reply": f"❌ 服务器内部错误: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(debug=True)
