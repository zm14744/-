import requests
import os

# 优先使用环境变量，若未设置则使用硬编码（便于测试）
API_KEY = os.environ.get("DEEPSEEK_API_KEY", "sk-0aaf311b073a419dbc352c02ef019b86")
API_URL = "https://api.deepseek.com/v1/chat/completions"

# 设为 True 则跳过真实 API，返回模拟回复（用于调试）
ASK_AI_MOCK = False  # 生产环境请设为 False

SYSTEM_PROMPT = """你是离散数学专家。所有数学公式必须用标准 LaTeX 编写，并严格用 `$...$` 或 `$$...$$` 包裹。

**格式要求**：
- 行内公式：`$...$`
- 独立公式：`$$...$$`
- 矩阵示例：`$$\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$$`
- 组合数：`$\\binom{n}{k}$`
- 图论：`$\\operatorname{tr}(A^2)$`

**禁止**使用 `\JBLOCK`、`IJBLOCK`、`Icdot`、`\operatomame` 等非标准标记。"""

def ask_ai(messages, retries=1):
    """
    参数 messages: 列表，每个元素为 {"role": "user" 或 "assistant", "content": "..."}
    """
    if ASK_AI_MOCK:
        return """
        $$\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$$
        
        行内公式：$v_1, v_2, \\dots, v_n$
        
        集合：$A = \\{1, 2, \\dots, 10\\}$
        
        组合数：$\\binom{n}{k}$
        
        图论：$\\operatorname{tr}(A^2)$
        
        ✅ 这是模拟模式（已携带上下文），说明后端已正常响应。
        """
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    # 构建 API 请求体，包含系统提示和完整对话历史
    api_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
    
    data = {
        "model": "deepseek-chat",
        "messages": api_messages
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
