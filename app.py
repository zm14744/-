from flask import Flask, request, jsonify
from ai import ask_ai

app = Flask(__name__)

@app.route("/chat", methods=["POST"])
def chat():
    text = request.json.get("text", "")

    # 一次性返回完整结果
    result = ask_ai(text)

    return jsonify({"text": result})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
