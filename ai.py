import requests
import os
import time
import random
import base64
import json
import re

from teaching import teaching_prompt

API_KEY = os.environ.get("DEEPSEEK_API_KEY")
API_URL = "https://api.deepseek.com/chat/completions"

# 调试模式：True 时返回模拟回复，不调用真实 API
ASK_AI_MOCK = False

# 控制单次请求规模，避免上下文无限增长和费用失控
MAX_HISTORY_MESSAGES = 16
MAX_MESSAGE_CHARS = 6000
MAX_OUTPUT_TOKENS = 2000

SYSTEM_PROMPT = r"""你是离散数学智能辅学系统中的教学助手。

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
6. 图片识题会把内容整理成“【题目文字】”和“【图形信息】”（也兼容旧标签“【题干与公式识别】”“【图形结构识别】”），两部分职责不同：
   - 题目的文字要求、编号、问法，以“题目文字”为主。
   - 图中的顶点、边、箭头、邻接关系、层次和二维结构，以“图形信息”为主。
   - 图形区域附近的 OCR 乱码、边名、顶点名重复内容已尽量清理；不要把残留的局部噪声当成关键冲突。
   - e1、e2、e3 这类写在边旁的符号默认是边的名称，不是权值；只有题目明确是带权图或图中存在清楚、独立的数值权重时，才按权值处理。
   - 图形信息中标记为“可能/不确定”的内容不能当作确定事实；如果不影响当前问题，就先忽略，不要因此中断教学。
   - 只有当两部分对“会直接改变答案的关键信息”给出相互矛盾、且都较可信的结果时，才请学生确认。
   - 能依据高置信度信息继续讲解时，就继续讲解，不要仅因为少量识别瑕疵要求学生重新确认原图。

【数学格式要求】
- 所有数学公式必须使用可被 MathJax 直接解析的标准 LaTeX。
- 行内公式使用 `$...$`；独立公式使用 `$$...$$`；每一个 `$` 必须成对闭合。
- 下标必须写成 `_`，例如 `$a_{ij}$`、`$v_1$`；表示下标时禁止写成 `\_`，更禁止写成 `*{ij}`。
- 矩阵维数写成 `$A=(a_{ij})_{5\times 5}$`，禁止写成 `*{5\times5}`。
- 分段定义必须使用 `cases`，例如：
  $$
  a_{ij}=
  \begin{cases}
  1, & v_i\text{ 与 }v_j\text{ 相邻},\\
  0, & \text{否则}.
  \end{cases}
  $$
- 只要数学定义中出现“若/当……则取某值，否则取另一值”，必须排成多行 `cases`。
- 严禁把分段定义压成一行，例如 `a_{ij}=\{1, 条件, 0, 否则\}` 这种写法即使能渲染也视为错误格式。
- 分段定义的左侧也必须放在同一个数学块里；禁止先在普通文本中写 `a_{ij}=`，再另起 `$$...$$`。
- 数学公式与中文说明要分开。例如应写 `$A=(a_{ij})_{5\times5}$ 满足：`，不要把“满足、其中”等中文直接塞进 `$...$`。
- 公式中的中文说明必须放入 `\text{...}`，不要把“满足、否则、相邻”等中文裸写在数学公式内部。
- 矩阵示例：
  $$
  \begin{bmatrix}
  a & b\\
  c & d
  \end{bmatrix}
  $$
- 组合数：$\binom{n}{k}$。
- 图论：$\operatorname{tr}(A^2)$。
- 输出前自行检查：美元符号是否配对、上下标花括号是否闭合、`\begin{...}` 与 `\end{...}` 是否成对。
- 禁止输出 `INLINE`、`BLOCK` 等内部占位词。
- 禁止使用非标准伪 LaTeX 标记。
- 数学下标绝不能用 Markdown 星号代替；禁止出现 `a*{ij}`、`*a*{ij}`、`)*{5\\times5}`、`$*` 这类写法。
- 不要用 `*...*` 或 `**...**` 包裹数学公式；公式只用成对的 `$...$` 或 `$$...$$`。

【回答风格】
- 使用中文回答。
- 表达清楚、简洁。
- 不堆砌无关内容。
- 需要分步时按自然逻辑分步，不要制造过多层级。
"""



# 图像理解模型：只负责补充 OCR 无法提取的图形/结构信息，不直接解题。
VISION_MODEL = os.environ.get(
    "DEEPSEEK_VISION_MODEL",
    "deepseek-v4-flash-vision-exp"
)
VISION_MAX_OUTPUT_TOKENS = 1800
VISION_ENABLED = os.environ.get(
    "VISION_ANALYSIS_ENABLED",
    "1"
).strip().lower() not in {"0", "false", "off", "no"}

VISION_PROMPT = """你是离散数学题目的“图片文字校对 + 图形结构解析器”。

你会同时看到原始题目图片和普通 OCR 结果。你的任务不是解题，而是把图片整理成两部分：
1. corrected_text：干净、可读的题目文字；
2. visual_text：OCR 难以表达的图形结构信息。

【corrected_text 要求】
- 直接根据原图校对 OCR，不要机械照抄 OCR。
- 保留题目标题、题干、(1)(2)(3)…等小问及数学符号。
- 重点修正 v1、v2、v3、v4、v5 等下标/编号被 OCR 拆坏的问题。
- 删除“夹在题干和小问之间”的图形 OCR 噪声，例如图中的 v1、e1、e2、线段附近乱码等。
- 不要把图中边名、顶点名的散落标签重复塞进题目正文。
- 看不清的正文不要编造；必要时保留最接近原图的写法并在该处标“[不清楚]”。

【visual_text 要求】
- 图论优先确认：有向/无向、是否带权、顶点、边连接关系、箭头、自环、重边。
- e1、e2、e3 这类写在边旁的符号默认是“边的名称”，绝不能自动解释成权值 1、2、3。
- 只有题目明确说明是带权图，或图片中存在与边名分离且清晰可确认的数值时，才输出边权。
- 不要根据 OCR 的乱码猜出 22、86 之类的权值。
- 如果是树、哈斯图、状态图、矩阵、真值表等，也要按结构描述。
- 只写能从图中确认的信息；不确定的地方标“可能/不确定”。
- 不要解题，不要给答案。

请只返回一个 JSON 对象，不要 Markdown 代码块，不要额外解释：
{
  "corrected_text": "校对后的完整题目文字",
  "visual_text": "图形结构描述；若没有需要补充的图形结构则为空字符串",
  "has_visual_structure": true
}
其中 has_visual_structure 只能是 true 或 false。
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



def _repair_common_latex_typos(text):
    """
    修复非常明确、低风险的 LaTeX / Markdown 笔误。
    不猜数学结论，只修格式字符。
    """
    if not isinstance(text, str) or not text:
        return text

    repaired = text

    # 下标：a\_{ij} -> a_{ij}
    repaired = re.sub(
        r"\\_\{([A-Za-z0-9,]+)\}",
        r"_{\1}",
        repaired
    )

    # a*{ij} -> a_{ij}
    repaired = re.sub(
        r"(?<![A-Za-z0-9])([A-Za-z])\*\{([A-Za-z0-9]{1,8})\}",
        r"\1_{\2}",
        repaired
    )

    # (a_{ij})*{5\times5} -> (a_{ij})_{5\times5}
    repaired = re.sub(
        r"(\))\*\{(\d+\s*\\times\s*\d+)\}",
        r"\1_{\2}",
        repaired
    )

    # a{ij} -> a_{ij}（只修邻接矩阵常见变量 a）
    repaired = re.sub(
        r"(?<![A-Za-z0-9_])a\{([A-Za-z0-9,]{1,8})\}",
        r"a_{\1}",
        repaired
    )

    # (a_{ij}){5\times5} -> (a_{ij})_{5\times5}
    repaired = re.sub(
        r"(\(a_\{ij\}\))\{(\d+\s*\\times\s*\d+)\}",
        r"\1_{\2}",
        repaired
    )

    # 模型偶尔会在公式边界旁插入 Markdown 强调星号：
    repaired = repaired.replace("$*", "$").replace("*$", "$")

    # 行首 "*a_{ij}" 这种不是正常列表，而是公式强调符残留。
    repaired = re.sub(
        r"(?m)^[ \t]*\*([A-Za-z](?:_\{[^}\n]+\})?)",
        r"\1",
        repaired
    )

    return repaired


def _math_delimiters_balanced(text):
    """
    检查 $...$ 与 $$...$$ 是否成对。
    这里只做格式体检，不尝试解释数学内容。
    """
    if not isinstance(text, str):
        return False

    mode = None
    index = 0
    length = len(text)

    while index < length:
        char = text[index]

        # 跳过转义美元符号
        if char == "\\":
            index += 2
            continue

        if char != "$":
            index += 1
            continue

        is_double = (
            index + 1 < length
            and text[index + 1] == "$"
        )

        token = "$$" if is_double else "$"

        if mode is None:
            mode = token
        elif mode == token:
            mode = None
        else:
            # 在 $...$ 内遇到 $$，或反过来，都视为可疑。
            return False

        index += 2 if is_double else 1

    return mode is None



def _iter_math_segments(text):
    if not isinstance(text, str):
        return []

    segments = []
    index = 0
    length = len(text)

    while index < length:
        if text[index] == "\\":
            index += 2
            continue

        if text[index] != "$":
            index += 1
            continue

        is_double = index + 1 < length and text[index + 1] == "$"
        token = "$$" if is_double else "$"
        start = index + len(token)
        cursor = start

        while cursor < length:
            if text[cursor] == "\\":
                cursor += 2
                continue

            if text.startswith(token, cursor):
                segments.append((token, text[start:cursor]))
                index = cursor + len(token)
                break

            cursor += 1
        else:
            break

    return segments


def _has_naked_chinese_in_math(content):
    if not isinstance(content, str) or not content:
        return False

    scrubbed = re.sub(
        r"\\text\{[^{}]*\}",
        "",
        content
    )

    return bool(re.search(r"[\u4e00-\u9fff]", scrubbed))


def _remove_math_for_plaintext_checks(text):
    plain = re.sub(
        r"\$\$[\s\S]*?\$\$",
        "",
        text
    )
    plain = re.sub(
        r"\$(?!\$)(?:\\.|[^$\n])+\$",
        "",
        plain
    )
    return plain


def _looks_like_broken_math(text):
    if not isinstance(text, str) or not text.strip():
        return True

    suspicious_patterns = (
        r"\\_\{",          # a\_{ij}
        r"\*\{[^}\n]+\}",  # a*{ij} / )*{5\times5}
        r"\$\*",
        r"\*\$",
    )

    if any(re.search(pattern, text) for pattern in suspicious_patterns):
        return True

    if not _math_delimiters_balanced(text):
        return True

    # 分段定义被错误压成一行：
    # 例如 a_{ij}=\{1, 条件, 0, \text{否则}\}
    pseudo_piecewise = re.search(
        r"=\s*\\?\{\s*[^$]{0,500}(?:否则|otherwise)[^$]{0,200}",
        text,
        flags=re.IGNORECASE | re.DOTALL
    )

    if pseudo_piecewise and r"\begin{cases}" not in text:
        return True

    # 更具体地识别邻接矩阵等“1/0/否则”定义被摊成一行的情况。
    flattened_condition = re.search(
        r"(?:[A-Za-z]_\{[^}]+\})\s*="
        r"[^$]{0,300}(?:^|[^0-9])1(?:[^0-9]|$)"
        r"[^$]{0,300}(?:^|[^0-9])0(?:[^0-9]|$)"
        r"[^$]{0,300}否则",
        text,
        flags=re.DOTALL
    )

    if flattened_condition and r"\begin{cases}" not in text:
        return True

    for _delimiter, math_content in _iter_math_segments(text):
        if _has_naked_chinese_in_math(math_content):
            return True

    plain_text = _remove_math_for_plaintext_checks(text)

    # a_{ij}= 被放在普通文本中，后面才另起数学块。
    if re.search(
        r"(?m)^[ \t]*a_\{ij\}\s*=\s*$",
        plain_text
    ):
        return True

    # 邻接矩阵维数漏掉下标符号。
    if re.search(
        r"A\s*=\s*\(a_\{ij\}\)\s*\{\d+\s*\\times\s*\d+\}",
        text
    ):
        return True

    if "\x08" in text or "\x0c" in text:
        return True

    return False


def _regenerate_broken_math_answer(
    final_messages,
    broken_content,
    timeout=(10, 60)
):
    """
    仅在答案数学格式损坏时额外重生成一次。
    这是异常兜底，正常回答不会多一次 API 调用。
    """
    repair_instruction = (
        "你上一条回答中的 Markdown/LaTeX 格式损坏了。"
        "请完整重写上一条回答，保持原来的数学含义、教学方式和答案内容，"
        "不要提到“格式修复”或这条指令。"
        "严格使用标准 MathJax LaTeX：行内 $...$，独立公式 $$...$$；"
        "下标只用 _{...}；所有‘若……否则……’的条件定义必须使用多行 cases；"
        "整个 a_{ij}=\\begin{cases}...\\end{cases} 必须放在同一对 $$ 中；"
        "矩阵维数写成 $A=(a_{ij})_{5\\times5}$，中文“满足/其中”放在公式外；"
        "禁止把 a_{ij}={1, 条件, 0, 否则} 摊成一行；"
        "禁止使用星号代替下标，禁止出现 a*{ij}、$*、*a*{ij}。"
        "输出前检查所有美元符号、花括号和 begin/end 是否成对。"
    )

    retry_messages = list(final_messages)
    retry_messages.append({
        "role": "assistant",
        "content": broken_content
    })
    retry_messages.append({
        "role": "user",
        "content": repair_instruction
    })

    payload = {
        "model": "deepseek-v4-flash",
        "messages": retry_messages,
        "thinking": {"type": "disabled"},
        "max_tokens": MAX_OUTPUT_TOKENS,
        "stream": False
    }

    try:
        response = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=timeout
        )

        if response.status_code != 200:
            print(
                "数学格式重生成失败："
                f"HTTP {response.status_code}；"
                f"{response.text[:500]}"
            )
            return None

        result = response.json()
        choices = result.get("choices")

        if not choices:
            print("数学格式重生成失败：缺少 choices")
            return None

        content = choices[0].get("message", {}).get("content")

        if not isinstance(content, str) or not content.strip():
            print("数学格式重生成失败：返回内容为空")
            return None

        repaired = _repair_common_latex_typos(content.strip())

        if _looks_like_broken_math(repaired):
            print("数学格式重生成后仍检测到异常")
            return None

        print("数学格式异常已自动重生成")
        return repaired

    except Exception as exc:
        print(f"数学格式重生成异常：{repr(exc)}")
        return None



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


def ask_ai(messages, retries=2, teaching_context=None):
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

    system_content = SYSTEM_PROMPT + teaching_prompt(teaching_context)

    api_messages = [
        {"role": "system", "content": system_content}
    ] + clean_messages

    data = {
        "model": "deepseek-v4-flash",
        "messages": api_messages,
        "max_tokens": MAX_OUTPUT_TOKENS,
        # 教学场景以低延迟和稳定输出为优先，显式关闭默认高强度思考。
        "thinking": {"type": "disabled"},
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

            content = _repair_common_latex_typos(content)

            if _looks_like_broken_math(content):
                print(
                    "检测到 AI 数学格式异常，尝试自动重生成。"
                )

                regenerated = _regenerate_broken_math_answer(
                    api_messages,
                    content
                )

                if regenerated:
                    content = regenerated
                else:
                    print(
                        "数学格式自动重生成未成功，"
                        "已阻止损坏公式返回前端。"
                    )
                    return _failure(
                        "数学公式生成格式异常，请重新发送。"
                    )

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

def _guess_image_mime(raw):
    """根据文件头判断 DeepSeek Vision 支持的图片 MIME。"""
    if not isinstance(raw, (bytes, bytearray)) or not raw:
        return None

    data = bytes(raw[:16])

    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"

    return None



def _extract_vision_json(content):
    """从视觉模型输出中稳健提取 JSON。"""
    if not isinstance(content, str):
        return None

    text = content.strip()
    if not text:
        return None

    # 兼容模型偶尔包一层 ```json ... ```
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    first = text.find("{")
    last = text.rfind("}")
    if first < 0 or last <= first:
        return None

    try:
        data = json.loads(text[first:last + 1])
    except (TypeError, ValueError, json.JSONDecodeError):
        return None

    if not isinstance(data, dict):
        return None

    corrected_text = data.get("corrected_text", "")
    visual_text = data.get("visual_text", "")
    raw_has_visual = data.get("has_visual_structure", bool(visual_text))

    if isinstance(raw_has_visual, bool):
        has_visual = raw_has_visual
    elif isinstance(raw_has_visual, str):
        has_visual = raw_has_visual.strip().lower() in {
            "1", "true", "yes", "on"
        }
    else:
        has_visual = bool(raw_has_visual)

    if not isinstance(corrected_text, str):
        corrected_text = str(corrected_text or "")
    if not isinstance(visual_text, str):
        visual_text = str(visual_text or "")

    corrected_text = corrected_text.strip()
    visual_text = visual_text.strip()

    # 结果长度保险，避免实验模型异常长输出。
    if len(corrected_text) > 5000:
        corrected_text = corrected_text[:5000] + "\n[题目文字过长，已截断]"
    if len(visual_text) > 3000:
        visual_text = visual_text[:3000] + "\n[图形信息过长，已截断]"

    return {
        "corrected_text": corrected_text,
        "visual_text": visual_text if bool(has_visual) else "",
        "has_visual_structure": bool(has_visual and visual_text),
    }


def _vision_success(corrected_text, visual_text):
    return {
        "ok": True,
        # 保留 reply 字段，兼容已有 app.py / 旧代码。
        "reply": visual_text,
        "corrected_text": corrected_text,
        "visual_text": visual_text,
    }

def analyze_image_structure(image_bytes, ocr_text="", retries=1):
    """
    使用 DeepSeek Vision 补充离散数学图片中的图形结构。

    这是 OCR 的增强层：
    - OCR 失败不依赖这里；
    - Vision 失败也不会让已经成功的 OCR 整体失败。
    """
    if not VISION_ENABLED:
        return _failure("图形理解功能当前已关闭。")

    if not API_KEY:
        print("DeepSeek Vision 配置错误：未设置 DEEPSEEK_API_KEY")
        return _failure("图形理解服务尚未完成配置。")

    if not isinstance(image_bytes, (bytes, bytearray)) or not image_bytes:
        return _failure("没有检测到有效图片内容。")

    mime = _guess_image_mime(image_bytes)
    if not mime:
        return _failure("该图片格式暂不支持图形理解，请使用 JPG、PNG、GIF 或 WebP。")

    ocr_context = str(ocr_text or "").strip()
    if len(ocr_context) > 3500:
        ocr_context = ocr_context[:3500] + "\n[OCR 题干过长，已截断]"

    text_prompt = VISION_PROMPT
    if ocr_context:
        text_prompt += f"\n\n已提取的 OCR 题干（仅供校对和定位）：\n{ocr_context}"

    encoded = base64.b64encode(bytes(image_bytes)).decode("ascii")
    data_url = f"data:{mime};base64,{encoded}"

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": text_prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": data_url,
                            "detail": "high"
                        }
                    }
                ]
            }
        ],
        # 图形结构提取是短输出任务，不需要思考模式。
        # DeepSeek Chat Completions 默认会开启 thinking；
        # 显式关闭可避免输出预算被 reasoning_content 占用，
        # 最终 content 为空的情况。
        "thinking": {"type": "disabled"},
        "max_tokens": VISION_MAX_OUTPUT_TOKENS,
        "stream": False
    }

    total_attempts = max(1, retries + 1)

    for attempt in range(total_attempts):
        try:
            print(
                f"正在调用 DeepSeek Vision（第 {attempt + 1}/{total_attempts} 次）"
            )

            response = requests.post(
                API_URL,
                headers=headers,
                json=payload,
                timeout=(10, 90)
            )

            if response.status_code in RETRYABLE_STATUS:
                if attempt < total_attempts - 1:
                    wait_seconds = (2 ** attempt) + random.uniform(0, 0.4)
                    print(
                        f"DeepSeek Vision 暂时不可用，HTTP {response.status_code}，"
                        f"{wait_seconds:.1f} 秒后重试"
                    )
                    time.sleep(wait_seconds)
                    continue

                return _failure(
                    "图形结构理解暂时不可用，已保留文字识别结果。"
                )

            if not response.ok:
                print(
                    f"DeepSeek Vision 请求失败：HTTP {response.status_code}；"
                    f"响应内容：{response.text[:500]}"
                )
                return _failure(
                    "图形结构理解暂时不可用，已保留文字识别结果。"
                )

            try:
                result = response.json()
            except ValueError as exc:
                print(f"DeepSeek Vision 返回解析失败：{repr(exc)}")
                return _failure(
                    "图形结构理解暂时不可用，已保留文字识别结果。"
                )

            choices = result.get("choices")
            if not choices:
                print(f"DeepSeek Vision 返回缺少 choices：{result}")
                return _failure(
                    "图形结构理解暂时不可用，已保留文字识别结果。"
                )

            choice = choices[0] if isinstance(choices[0], dict) else {}
            message = choice.get("message", {})
            if not isinstance(message, dict):
                message = {}

            content = message.get("content")
            if not isinstance(content, str) or not content.strip():
                reasoning_content = message.get("reasoning_content")
                reasoning_len = (
                    len(reasoning_content)
                    if isinstance(reasoning_content, str)
                    else 0
                )
                finish_reason = choice.get("finish_reason")
                usage = result.get("usage")

                print(
                    "DeepSeek Vision 返回空内容："
                    f"finish_reason={finish_reason!r}；"
                    f"reasoning_len={reasoning_len}；"
                    f"usage={usage!r}"
                )

                # 实验模型偶发空内容时自动再试一次，
                # 不让一次空响应直接把图形理解判定为失败。
                if attempt < total_attempts - 1:
                    time.sleep((2 ** attempt) + random.uniform(0, 0.4))
                    continue

                return _failure(
                    "图形结构理解没有返回有效结果，已保留文字识别结果。"
                )

            parsed = _extract_vision_json(content)

            if parsed is None:
                print(
                    "DeepSeek Vision 返回内容不是有效 JSON："
                    f"{content[:500]!r}"
                )

                # 结构化结果很关键。第一次格式异常时自动再试一次，
                # 避免把一坨 JSON/自然语言直接显示给学生。
                if attempt < total_attempts - 1:
                    time.sleep((2 ** attempt) + random.uniform(0, 0.4))
                    continue

                return _failure(
                    "图片内容整理暂时失败，已保留普通文字识别结果。"
                )

            corrected_text = parsed["corrected_text"]
            visual_text = parsed["visual_text"]

            # 校对文字为空时不强行覆盖 OCR；app.py 会自动回退原 OCR。
            print(
                "DeepSeek Vision 调用成功："
                f"corrected_text={len(corrected_text)} chars；"
                f"visual_text={len(visual_text)} chars"
            )

            return _vision_success(
                corrected_text,
                visual_text
            )

        except requests.exceptions.Timeout as exc:
            print(f"DeepSeek Vision 请求超时：{repr(exc)}")
            if attempt < total_attempts - 1:
                time.sleep((2 ** attempt) + random.uniform(0, 0.4))
                continue
            return _failure(
                "图形结构理解响应较慢，已保留文字识别结果。"
            )

        except requests.exceptions.ConnectionError as exc:
            print(f"DeepSeek Vision 网络连接异常：{repr(exc)}")
            if attempt < total_attempts - 1:
                time.sleep((2 ** attempt) + random.uniform(0, 0.4))
                continue
            return _failure(
                "图形结构理解暂时无法连接，已保留文字识别结果。"
            )

        except requests.exceptions.RequestException as exc:
            print(f"DeepSeek Vision 请求异常：{repr(exc)}")
            return _failure(
                "图形结构理解请求失败，已保留文字识别结果。"
            )

        except Exception as exc:
            print(f"DeepSeek Vision 未知异常：{repr(exc)}")
            return _failure(
                "图形结构理解暂时出现异常，已保留文字识别结果。"
            )

    return _failure(
        "图形结构理解暂时不可用，已保留文字识别结果。"
    )
