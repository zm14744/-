import requests
import os
import time
import random
import base64

from teaching import teaching_prompt

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
6. 图片识题可能同时包含“【题干与公式识别】”和“【图形结构识别】”：
   - 必须综合两部分理解题目。
   - 图形结构中标记为“可能/不确定”的内容不能当作确定事实。
   - 如果 OCR 题干与图形结构明显冲突，先指出冲突并请学生确认，不要擅自补全。

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



# 图像理解模型：只负责补充 OCR 无法提取的图形/结构信息，不直接解题。
VISION_MODEL = os.environ.get(
    "DEEPSEEK_VISION_MODEL",
    "deepseek-v4-flash-vision-exp"
)
VISION_MAX_OUTPUT_TOKENS = 1200
VISION_ENABLED = os.environ.get(
    "VISION_ANALYSIS_ENABLED",
    "1"
).strip().lower() not in {"0", "false", "off", "no"}

VISION_PROMPT = """你是离散数学题目的视觉结构解析器。

任务：结合图片和已提取的 OCR 题干，只补充 OCR 难以表达的“图形结构信息”。不要解题，不要给答案，不要展开教学。

重点识别：
1. 图论图形：有向/无向、顶点标签、边、箭头方向、权值、自环、重边。
2. 树与生成树：根节点、父子关系、层次、边权。
3. 哈斯图：元素以及覆盖关系。
4. 状态图/自动机：状态、转移方向、转移标记。
5. 真值表、关系矩阵、邻接矩阵等依赖二维排版的信息：明确行列与单元格内容。
6. 集合图、维恩图、欧拉图等：集合包含、相交、区域标记。

要求：
- 只描述图片中能够确认的信息，不猜测被遮挡或模糊的边。
- 看不清的地方标记“可能/不确定”。
- 不要重复整段 OCR 题干。
- 如果图片没有需要额外补充的图形结构，只返回：未发现需要补充的图形结构。
- 使用简洁中文；图结构尽量按“顶点 / 边或关系 / 权值或方向”的结构列出。
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

            text = content.strip()
            if len(text) > 3000:
                text = text[:3000] + "\n[图形结构描述过长，已截断]"

            print("DeepSeek Vision 调用成功")
            return _success(text)

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
