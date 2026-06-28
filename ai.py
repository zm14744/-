from openai import OpenAI

client = OpenAI(
    api_key="sk-0aaf311b073a419dbc352c02ef019b86",
    base_url="https://api.deepseek.com"
)

SYSTEM_PROMPT = """
你是离散数学专精AI助手。
要求：
1. 回答集合论、关系、函数、图论、逻辑、组合数学
2. 使用规范数学表达
3. 必要时使用LaTeX
"""

def ask_ai_stream(text):

    stream = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text}
        ],
        stream=True
    )

    for chunk in stream:
        if chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
