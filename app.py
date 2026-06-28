from flask import Flask, request, jsonify, render_template
from ai import ask_ai

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    text = data.get("text", "")
    reply = ask_ai(text)
    return jsonify({"reply": reply})

if __name__ == "__main__":
    app.run(debug=True)
