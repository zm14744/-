import requests
import os
import re

# 【完全保留你的原始API配置，无任何改动】
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

# 优化超时配置，解决ReadTimeout报错
MAX_INPUT_LEN = 3000
TIMEOUT_CONNECT = 8
TIMEOUT_READ = 40
TIMEOUT = (TIMEOUT_CONNECT, TIMEOUT_READ)
# 限制上下文最大轮数，避免请求体过大导致响应缓慢
MAX_HISTORY_ROUND = 8
ILLEGAL_LATEX = [
    (r"\\JBLOCK", ""),
    (r"IJBLOCK", ""),
    (r"Icdot", r"\\cdot"),
    (r"Itimes", r"\\times"),
    (r"\\operatomame", r"\\operatorname"),
]

# 注释全局Session，改用单次请求规避连接池卡死问题
# session = requests.Session()

def clean_latex(text: str) -> str:
    """后端预清洗非法LaTeX标记，减轻前端渲染压力"""
    res = text
    for pattern, repl in ILLEGAL_LATEX:
        res = re.sub(pattern, repl, res)
    return res

# 保留history上下文参数，新增历史截断逻辑
def ask_ai(text, retries=1, history=None):
    text = text.strip()
    retries = max(0, retries)
    if history is None:
        history = []

    # 单条输入长度限制
    if len(text) > MAX_INPUT_LEN:
        return f"❌ 输入内容过长，最大支持{MAX_INPUT_LEN}字符"

    if ASK_AI_MOCK:
        return """
        $$\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$$
        
        行内公式：$v_1, v_2, \\dots, v_n$
        
        集合：$A = \\{1, 2, \\dots, 10\\}$
        
        组合数：$\\binom{n}{k}$
        
        图论：$\\operatorname{tr}(A^2)$
        
        ✅ 这是模拟模式，后端代码无异常，网络连通失败请切换网络。
        """
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    # 截断超长历史对话，减少请求负载，大幅降低超时概率
    if len(history) > MAX_HISTORY_ROUND:
        history = history[-MAX_HISTORY_ROUND:]

    # 组装完整上下文消息：系统提示词 + 截断后的历史 + 当前提问
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
            # 每次新建请求，不使用全局Session，修复HTTPS连接池卡死超时
            res = requests.post(API_URL, headers=headers, json=data, timeout=TIMEOUT)
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
                return "❌ 请求读取超时（网络访问api.deepseek.com缓慢/受限），建议切换手机热点或缩短对话上下文重试"
        except requests.exceptions.RequestException as e:
            if attempt >= retries:
                return f"❌ 网络请求失败: {str(e)}"
        except Exception as e:
            return f"❌ 未知错误: {str(e)}"
    return "❌ 所有重试均失败，请检查网络环境"
