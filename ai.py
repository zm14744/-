import requests

API_KEY = "sk-0aaf311b073a419dbc352c02ef019b86"
API_URL = "https://api.deepseek.com/v1/chat/completions"

SYSTEM_PROMPT = "你是离散数学专业助手，回答要结构清晰。"

def ask_ai(text):
    try:
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }
        data = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text}
            ]
        }
        res = requests.post(API_URL, headers=headers, json=data, timeout=30)
        res.raise_for_status()
        result = res.json()

        if "error" in result:
            return f"❌ API 错误: {result['error'].get('message', '未知错误')}"

        return result["choices"][0]["message"]["content"]

    except requests.exceptions.Timeout:
        return "❌ 请求超时，请稍后再试"
    except requests.exceptions.RequestException as e:
        return f"❌ 网络请求失败: {str(e)}"
    except (KeyError, IndexError, ValueError) as e:
        return f"❌ 响应解析失败: {str(e)}"
    except Exception as e:
        return f"❌ 未知错误: {str(e)}"

