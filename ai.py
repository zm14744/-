import requests
import time

API_KEY = "sk-0aaf311b073a419dbc352c02ef019b86"
API_URL = "https://api.deepseek.com/v1/chat/completions"

SYSTEM_PROMPT = """你是离散数学专家。**所有数学公式必须用标准 LaTeX 编写，并严格用 `$...$` 或 `$$...$$` 包裹。**

**绝对禁止**使用以下错误标记：
- `\JBLOCK`、`IJBLOCK`、`Icdot`、`Itimes`、`\operatomame`
- 任何非标准命令（如 `\textrightarrow` 应改为 `\rightarrow`）
- 裸 LaTeX 命令（未用 `$` 包裹的 `\dots`、`\overline` 等）

**正确示例**：
- 行内：`$v_1, v_2, \dots, v_n$`
- 块级：`$$M_{R^2} = \begin{pmatrix} 1 & 0 \\ 0 & 1 \end{pmatrix}$$`
- 集合：`$A = \{1, 2, \dots, 10\}$`
- 矩阵：`$$\begin{bmatrix} a & b \\ c & d \end{bmatrix}$$`
- 组合数：`$\binom{n}{k}$`
- 图论：`$\operatorname{tr}(A^2)$`

请严格按照以上规则输出，否则用户将无法正确显示公式。"""

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

