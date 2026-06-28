from openai import OpenAI

client = OpenAI(
    api_key="sk-0aaf311b073a419dbc352c02ef019b86",
    base_url="https://api.deepseek.com"
)

SYSTEM_PROMPT = "你是离散数学助手，回答要结构化"

def ask_ai(text):
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text}
        ]
    )

    return response.choices[0].message.content
