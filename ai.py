import requests

API_KEY = "sk-0aaf311b073a419dbc352c02ef019b86"   # 请替换
API_URL = "https://api.deepseek.com/v1/chat/completions"

# ⭐ 关键修改：增加公式包裹要求
SYSTEM_PROMPT = """你是离散数学专业助手，回答要结构清晰。
所有数学公式请使用 $...$ 包裹行内公式，使用 $$...$$ 包裹行间公式。
例如：集合包含关系应写为 $C \\subseteq V$，二项式应写为 $\\binom{n}{k}$。"""

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
