import requests
import json

API_KEY = "sk-0aaf311b073a419dbc352c02ef019b86"
API_URL = "https://api.deepseek.com/v1/chat/completions"

SYSTEM_PROMPT = """
你是离散数学专精AI助手。
只回答：集合论、关系与函数、图论、组合数学、数理逻辑。
必须结构化回答：定义 → 步骤 → 结论。
"""


def ask_ai_stream(text):

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text}
        ],
        "stream": True
    }

    response = requests.post(
        API_URL,
        headers=headers,
        json=payload,
        stream=True
    )

    for line in response.iter_lines():

        if not line:
            continue

        line = line.decode("utf-8")

        if "data: " in line:
            data = line.replace("data: ", "")

            if data == "[DONE]":
                break

            try:
                obj = json.loads(data)
                chunk = obj["choices"][0]["delta"].get("content", "")
                yield chunk
            except:
                continue
