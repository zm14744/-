import requests

API_KEY = "sk-0aaf311b073a419dbc352c02ef019b86"
if API_KEY == "sk-0aaf311b073a419dbc352c02ef019b86":
    print("⚠️ 警告: 未设置有效的 API_KEY，请修改 ai.py 中的 API_KEY 变量。")

API_URL = "https://api.deepseek.com/v1/chat/completions"

SYSTEM_PROMPT = """你是离散数学专业助手，回答要结构清晰且排版优美。

**重要规则**：
- 所有数学公式必须用 `$...$` 包裹（行内）或 `$$...$$` 包裹（独立成行）。
- 矩阵、行列式、大括号等复杂结构必须用 `\\begin{...} ... \\end{...}` 并整体置于 `$$...$$` 中。
- 示例：
  - 子集关系：$C \\subseteq V$
  - 二项式：$\\binom{n}{k}$
  - 矩阵：$$\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$$
- 禁止返回裸 LaTeX 命令（未用 `$` 包裹）。"""

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
