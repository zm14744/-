import requests
import os
import time
import random

API_KEY = os.environ.get("DEEPSEEK_API_KEY")
API_URL = "https://api.deepseek.com/chat/completions"

# 调试模式：True 时返回模拟回复，不调用真实 API
ASK_AI_MOCK = False

# 控制单次请求规模，避免上下文无限增长和费用失控
MAX_HISTORY_MESSAGES = 16
MAX_MESSAGE_CHARS = 6000
MAX_OUTPUT_TOKENS = 2000

SYSTEM_PROMPT = """你是离散数学智能辅学系统中的教学助手。

你的目标不是单纯替学生做题，而是帮助学生理解离散数学知识、形成解题思路，并能够独立完成问题。

【教学原则】
1. 对“题目求解、练习题、扫描得到的题目”，默认采用“提示优先”：
   - 不直接给最终答案。
   - 先指出涉及的知识点。
   - 给出一到两个关键提示或下一步思路。
   - 可以通过提问引导学生继续思考。
2. 只有当学生明确提出“给我答案”“完整解析”“直接解出来”“告诉我最终答案”等要求时，才提供完整解答。
3. 如果学生只是询问概念、定义、定理含义，可以正常直接解释，不必强制使用提示模式。
4. 如果学生要求“出题”“生成练习题”，只给题目，不附答案和解析；除非学生之后明确要求答案。
5. 如果学生答案有错误，先指出错误类型和思路问题，不要立刻把整道题答案全部给出。

【数学格式要求】
- 所有数学公式使用标准 LaTeX。
- 行内公式使用 `$...$`。
- 独立公式使用 `$$...$$`。
- 矩阵示例：$$\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$$
- 组合数：$\\binom{n}{k}$
- 图论：$\\operatorname{tr}(A^2)$
- 禁止输出 `INLINE`、`BLOCK` 等内部占位词。
- 禁止使用非标准伪 LaTeX 标记。

【回答风格】
- 使用中文回答。
- 表达清楚、简洁。
- 不堆砌无关内容。
- 需要分步时按自然逻辑分步，不要制造过多层级。
"""

RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def _success(reply):
    return {
        "ok": True,
        "reply": reply
    }


def _failure(error):
    return {
        "ok": False,
        "error": error
    }


def _trim_messages(messages):
    """限制历史消息数量和单条长度，降低上下文成本。"""
    if not isinstance(messages, list):
        return []

    trimmed = []
    for item in messages[-MAX_HISTORY_MESSAGES:]:
        if not isinstance(item, dict):
            continue

        role = item.get("role")
        content = item.get("content", "")

        if role not in ("user", "assistant"):
            continue

        if not isinstance(content, str):
            content = str(content)

        content = content.strip()
        if not content:
            continue

        if len(content) > MAX_MESSAGE_CHARS:
            content = content[:MAX_MESSAGE_CHARS] + "\n[内容过长，已截断]"

        trimmed.append({
            "role": role,
            "content": content
        })

    return trimmed


def _friendly_http_error(status_code):
    """把常见 HTTP 错误转换为用户可读的中文提示。"""
    if status_code == 400:
        return "AI 请求内容有误，请稍后重新发送。"
    if status_code in (401, 403):
        return "AI 服务配置异常，请联系管理员。"
    if status_code == 402:
        return "AI 服务当前不可用，请联系管理员检查账户状态。"
    if status_code == 429:
        return "当前访问人数较多，请稍后再试。"
    if status_code in (500, 502, 503, 504):
        return "AI 服务暂时繁忙，请稍后再试。"
    return "AI 服务暂时出现异常，请稍后再试。"


def ask_ai(messages, retries=2):
    """
    调用 DeepSeek。

    返回：
        成功：
        {
            "ok": True,
            "reply": "..."
        }

        失败：
        {
            "ok": False,
            "error": "中文错误提示"
        }

    默认最多：首次请求 + 2 次自动重试。
    """
    if ASK_AI_MOCK:
        return _success("""这是一条模拟回复。

提示：这道题可以先判断它属于哪个离散数学知识点，再尝试写出第一步需要构造的数学对象。

例如矩阵可以正常显示为：

$$
\\begin{bmatrix}
1 & 2 \\\\
3 & 4
\\end{bmatrix}
$$
""")

    if not API_KEY:
        print("DeepSeek API 配置错误：未设置 DEEPSEEK_API_KEY")
        return _failure("AI 服务尚未完成配置，请联系管理员。")

    clean_messages = _trim_messages(messages)
    if not clean_messages:
        return _failure("没有检测到有效的消息内容。")

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    api_messages = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ] + clean_messages

    data = {
        "model": "deepseek-v4-flash",
        "messages": api_messages,
        "max_tokens": MAX_OUTPUT_TOKENS,
        "stream": False
    }

    total_attempts = max(1, retries + 1)

    for attempt in range(total_attempts):
        try:
            print(f"正在调用 DeepSeek API（第 {attempt + 1}/{total_attempts} 次）")

            response = requests.post(
                API_URL,
                headers=headers,
                json=data,
                timeout=(10, 60)
            )

            if response.status_code in RETRYABLE_STATUS:
                if attempt < total_attempts - 1:
                    wait_seconds = (2 ** attempt) + random.uniform(0, 0.4)
                    print(
                        f"DeepSeek 暂时不可用，HTTP {response.status_code}，"
                        f"{wait_seconds:.1f} 秒后重试"
                    )
                    time.sleep(wait_seconds)
                    continue

                return _failure(
                    _friendly_http_error(response.status_code)
                )

            if not response.ok:
                print(
                    f"DeepSeek 请求失败：HTTP {response.status_code}；"
                    f"响应内容：{response.text[:500]}"
                )
                return _failure(
                    _friendly_http_error(response.status_code)
                )

            try:
                result = response.json()
            except ValueError as exc:
                print(f"DeepSeek 返回内容解析失败：{repr(exc)}")
                return _failure("AI 服务返回了异常数据，请稍后再试。")

            if "error" in result:
                print(f"DeepSeek API 返回错误：{result['error']}")
                return _failure("AI 服务暂时出现异常，请稍后再试。")

            choices = result.get("choices")
            if not choices:
                print(f"DeepSeek 返回缺少 choices：{result}")
                return _failure("AI 服务没有返回有效内容，请重新发送。")

            content = choices[0].get("message", {}).get("content")
            if not content:
                return _failure("AI 服务没有生成有效回答，请重新发送。")

            print("DeepSeek API 调用成功")
            return _success(content)

        except requests.exceptions.Timeout as exc:
            print(f"DeepSeek 请求超时：{repr(exc)}")

            if attempt < total_attempts - 1:
                wait_seconds = (2 ** attempt) + random.uniform(0, 0.4)
                print(f"{wait_seconds:.1f} 秒后自动重试")
                time.sleep(wait_seconds)
                continue

            return _failure("AI 服务响应时间过长，请稍后重新发送。")

        except requests.exceptions.ConnectionError as exc:
            print(f"DeepSeek 网络连接异常：{repr(exc)}")

            if attempt < total_attempts - 1:
                wait_seconds = (2 ** attempt) + random.uniform(0, 0.4)
                print(f"{wait_seconds:.1f} 秒后自动重试")
                time.sleep(wait_seconds)
                continue

            return _failure("暂时无法连接 AI 服务，请检查网络后重试。")

        except requests.exceptions.RequestException as exc:
            print(f"DeepSeek 请求异常：{repr(exc)}")
            return _failure("AI 服务请求失败，请稍后重试。")

        except Exception as exc:
            # 详细技术错误仅写服务器日志，不暴露给学生
            print(f"AI 模块未知异常：{repr(exc)}")
            return _failure("系统暂时出现异常，请稍后重试。")

    return _failure("AI 服务暂时不可用，请稍后重试。")
