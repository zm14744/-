import requests
import os

ASK_AI_MOCK = False 

API_KEY = "sk-0aaf311b073a419dbc352c02ef019b86"  # 请替换
API_URL = "https://api.deepseek.com/v1/chat/completions"

SYSTEM_PROMPT = """你是离散数学专家。

【强制的数学格式标准】：
1. 所有的行内公式**必须**用 `\(...\)` 包裹，不要用 `$`。
2. 所有的独立块级公式**必须**用 `\[...\]` 包裹，不要用 `$$`。
3. 所有的希腊字母、上下标、花括号、运算符必须写在上述定界符之内。
4. 绝对禁止输出 `\JBLOCK`、`IJBLOCK`、`Icdot`、`\operatomame` 等错误拼写。"""

def ask_ai(text, retries=1):
    if ASK_AI_MOCK:
        return """
        \[
        \sum_{i=1}^{n} i = \frac{n(n+1)}{2}
        \]
        行内公式：\(v_1, v_2, \dots, v_n\)。
        集合：\(A = \{1, 2, \dots, 10\}\)。
        组合数：\(\binom{n}{k}\)。
        图论：\(\operatorname{tr}(A^2)\)。
        ✅ 模拟模式运行正常，请检查 API Key。
        """
    
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

    for attempt in range(retries + 1):
        try:
            res = requests.post(API_URL, headers=headers, json=data, timeout=(5, 20))
            res.raise_for_status()
            result = res.json()
            if "error" in result:
                return f"❌ API 错误: {result['error'].get('message', '未知错误')}"
            return result["choices"][0]["message"]["content"]
        except requests.exceptions.Timeout:
            if attempt < retries:
                continue
            else:
                return "❌ 请求超时，请稍后再试（已重试）"
        except requests.exceptions.RequestException as e:
            if attempt < retries:
                continue
            else:
                return f"❌ 网络请求失败: {str(e)}"
        except Exception as e:
            return f"❌ 未知错误: {str(e)}"
    return "❌ 所有重试均失败"
