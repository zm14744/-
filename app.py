from flask import Flask, render_template, request, Response, jsonify
from ai import ask_ai_stream
#from ocr import ocr_text

app = Flask(__name__)

# 首页
@app.route("/")
def index():
    return render_template("index.html")

# OCR接口
"""@app.route("/ocr", methods=["POST"])
def ocr():
    file = request.files["file"]
    text = ocr_text(file)
    return jsonify({"text": text})"""

# AI流式接口
@app.route("/chat_stream")
def chat_stream():

    text = request.args.get("text", "")

    def generate():
        for chunk in ask_ai_stream(text):
            yield chunk

    return Response(generate(), mimetype="text/plain")


if __name__ == "__main__":
    app.run(debug=True)

import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
