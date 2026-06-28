from flask import Flask, request, jsonify
from ai import ask_ai

app = Flask(__name__)

@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    text = data.get("text", "")

    # ⚠️ 一次性返回（稳定）
    reply = ask_ai(text)

    return jsonify({"reply": reply})


if __name__ == "__main__":
    app.run(debug=True)
