import requests
import time

API_KEY = "sk-0aaf311b073a419dbc352c02ef019b86"
API_URL = "https://api.deepseek.com/v1/chat/completions"

SYSTEM_PROMPT = """你是离散数学专家，所有公式必须严格用 LaTeX 编写。

**格式规则**：
- 行内公式用 `$...$`，独立公式用 `$$...$$`。
- 禁止使用 `\textrightarrow`、`\text{...}` 等非标准命令，应使用标准 LaTeX（如 `\rightarrow`、`\operatorname`）。
- 避免使用 `\JBLOCK`、`IJBLOCK`、`Icdot` 等错误标记。
- 所有矩阵、集合、组合数等必须置于 `$` 或 `$$` 之间。
- 使用 `\dots` 表示省略号，`\overline` 表示上划线，`\le` 表示 ≤。
- 若公式较长或包含矩阵，请务必使用 `$$...$$` 独立成行。

请确保输出符合上述标准，否则用户将无法正确显示公式。"""

def ask_ai(text, retries=3):
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

    for attempt in range(retries):
        try:
            res = requests.post(API_URL, headers=headers, json=data, timeout=(10, 60))
            res.raise_for_status()
            result = res.json()
            if "error" in result:
                return f"❌ API 错误: {result['error'].get('message', '未知错误')}"
            return result["choices"][0]["message"]["content"]
        except requests.exceptions.Timeout:
            if attempt < retries - 1:
                time.sleep(2)
                continue
            else:
                return "❌ 请求超时，请稍后再试（已重试 3 次）"
        except requests.exceptions.RequestException as e:
            if attempt < retries - 1:
                time.sleep(2)
                continue
            else:
                return f"❌ 网络请求失败: {str(e)}"
        except Exception as e:
            return f"❌ 未知错误: {str(e)}"
    return "❌ 所有重试均失败"


