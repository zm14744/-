import requests
import json

API_KEY = "sk-0aaf311b073a419dbc352c02ef019b86"

def ask_ai_stream(text):

    url = "https://api.deepseek.com/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    data = {
        "model": "deepseek-chat",
        "stream": True,
        "messages": [
            {"role": "system", "content": "你是数学解题助手，必须分步骤讲解"},
            {"role": "user", "content": text}
        ]
    }

    try:
        with requests.post(url, json=data, headers=headers, stream=True) as r:
            for line in r.iter_lines():
                if line:
                    line = line.decode("utf-8").replace("data: ", "")
                    if line == "[DONE]":
                        break

                    try:
                        obj = json.loads(line)
                        content = obj["choices"][0]["delta"].get("content", "")
                        if content:
                            yield content
                    except:
                        continue
    except:
        yield "AI请求失败"