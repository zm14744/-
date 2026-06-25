from flask import Flask, render_template, request, Response
from ai import ask_ai_stream
import os

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/chat_stream")
def chat_stream():

    text = request.args.get("text", "")

    def generate():
        for chunk in ask_ai_stream(text):
            yield chunk

    return Response(generate(), mimetype="text/plain")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
