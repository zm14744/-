import requests

# =========================
# 离散数学专精系统提示词
# =========================
SYSTEM_PROMPT = """
你是一个“离散数学专精AI助手”。

你的职责范围：
- 集合论（Set Theory）
- 关系与函数（Relations & Functions）
- 图论（Graph Theory）
- 组合数学（Combinatorics）
- 数理逻辑（Mathematical Logic）
- 证明方法（归纳法、反证法、构造法）

严格要求：
1. 只专注离散数学相关内容
2. 不要自称“数学解题助手”
3. 不要扩展到高等数学、物理或其他学科
4. 所有回答尽量结构化（定义 → 步骤 → 结论）
5. 可使用 LaTeX 表达数学公式
6. 如果问题不属于离散数学，说明无法回答并引导到相关内容
"""

# =========================
# 调用AI接口
# =========================
def ask_ai(text):

    url = "sk-0aaf311b073a419dbc352c02ef019b86"   # 真实API

    payload = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text}
        ],
        "temperature": 0.7
    }

    headers = {
        "Content-Type": "application/json",
        # 如果你有key：
        # "Authorization": "Bearer YOUR_API_KEY"
    }

    try:
        res = requests.post(url, json=payload, headers=headers, timeout=60)

        res.raise_for_status()

        data = res.json()

        # =========================
        # 兼容不同API返回结构
        # =========================
        if "choices" in data:
            return data["choices"][0]["message"]["content"]

        if "answer" in data:
            return data["answer"]

        if "result" in data:
            return data["result"]

        return str(data)

    except Exception as e:
        return f"AI调用失败：{str(e)}"
