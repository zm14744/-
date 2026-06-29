from flask import Flask, request, jsonify
import requests
import os

app = Flask(__name__)

API_KEY = os.getenv("OPENAI_API_KEY")
API_URL = "https://api.openai.com/v1/chat/completions"

@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    messages = data.get("messages", [])

    try:
        r = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": messages
            },
            timeout=60
        )

        res = r.json()

        return jsonify({
            "reply": res["choices"][0]["message"]["content"]
        })

    except Exception as e:
        return jsonify({
            "reply": f"❌ 错误: {str(e)}"
        })

if __name__ == "__main__":
    app.run(debug=True)
