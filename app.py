from flask import Flask, request, Response, jsonify
from ai import ask_ai_stream

app = Flask(__name__)

# ===== AI流式接口 =====
@app.route("/chat_stream", methods=["GET"])
def chat_stream():
    text = request.args.get("text", "")

    def generate():
        for chunk in ask_ai_stream(text):
            yield chunk

    return Response(generate(), mimetype="text/plain")


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
