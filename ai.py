import requests
import os
import re

# 【完全保留你的原始配置，无任何修改】
ASK_AI_MOCK = False 
API_KEY = "sk-0aaf311b073a419dbc352c02ef019b86"
API_URL = "https://api.deepseek.com/v1/chat/completions"
SYSTEM_PROMPT = """你是离散数学专家。所有数学公式必须用标准 LaTeX 编写，并严格用 `$...$` 或 `$$...$$` 包裹。
**格式要求**：
- 行内公式：`$...$`
- 独立公式：`$$...$$`
- 矩阵示例：`$$\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$$`
- 组合数：`$\\binom{n}{k}$`
- 图论：`$\\operatorname{tr}(A^2)$`
【重要新增要求】：
**所有数学符号（包括花括号 `\{ \}`、希腊字母、下标 `_`、上标 `^` 等）都必须用 `$...$` 或 `$$...$$` 包裹，绝对不能出现未包裹的 LaTeX 命令。** 
（例如：集合请写 `$\\{a,b\\}$`，而不要写 `(\\{a,b\\})` 或 `\{a,b\}`）。
**禁止**使用 `\JBLOCK`、`IJBLOCK`、`Icdot`、`\operatomame` 等非标准标记。"""

# 新增常量（不改动原有业务配置）
MAX_INPUT_LEN = 3000
TIMEOUT_CONNECT = 5
TIMEOUT_READ = 20
TIMEOUT = (TIMEOUT_CONNECT, TIMEOUT_READ)
ILLEGAL_LATEX = [
    (r"\\JBLOCK", ""),
    (r"IJBLOCK", ""),
    (r"Icdot", r"\\cdot"),
    (r"Itimes", r"\\times"),
    (r"\\operatomame", r"\\operatorname"),
]

# 全局复用请求会话，优化网络性能
session = requests.Session()

def clean_latex(text: str) -> str:
    """后端预清洗非法LaTeX标记，减轻前端渲染压力"""
    res = text
    for pattern, repl in ILLEGAL_LATEX:
        res = re.sub(pattern, repl, res)
    return res

# 新增history参数用于上下文记忆，原有逻辑全部保留
def ask_ai(text, retries=1, history=None):
    text = text.strip()
    retries = max(0, retries)
    if history is None:
        history = []

    # 输入长度限制，防止接口超限
    if len(text) > MAX_INPUT_LEN:
        return f"❌ 输入内容过长，最大支持{MAX_INPUT_LEN}字符"

    if ASK_AI_MOCK:
        return """
        $$\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$$
        
        行内公式：$v_1, v_2, \\dots, v_n$
        
        集合：$A = \\{1, 2, \\dots, 10\\}$
        
        组合数：$\\binom{n}{k}$
        
        图论：$\\operatorname{tr}(A^2)$
        
        ✅ 这是模拟模式，说明后端已正常响应。请检查 API Key 是否正确。
        """
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    # 组装完整上下文消息：系统提示词 + 历史对话 + 当前提问
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in history:
        role = "user" if msg["role"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["text"]})
    messages.append({"role": "user", "content": text})

    data = {
        "model": "deepseek-chat",
        "messages": messages
    }

    total_attempt = retries + 1
    for attempt in range(total_attempt):
        try:
            res = session.post(API_URL, headers=headers, json=data, timeout=TIMEOUT)
            res.raise_for_status()
            result = res.json()

            # 捕获API业务报错
            if "error" in result:
                err_msg = result["error"].get("message", "未知API错误")
                return f"❌ API 错误: {err_msg}"

            # 安全读取返回，避免数组越界崩溃
            choices = result.get("choices", [])
            if not choices:
                return "❌ AI 接口未返回有效回答"
            raw_reply = choices[0].get("message", {}).get("content", "")
            if not raw_reply.strip():
                return "❌ AI 返回内容为空"

            final_reply = clean_latex(raw_reply)
            return final_reply

        except requests.exceptions.Timeout:
            if attempt >= retries:
                return "❌ 请求超时，请稍后再试（已完成全部重试）"
        except requests.exceptions.RequestException as e:
            if attempt >= retries:
                return f"❌ 网络请求失败: {str(e)}"
        except Exception as e:
            return f"❌ 未知错误: {str(e)}"
    return "❌ 所有重试均失败"
