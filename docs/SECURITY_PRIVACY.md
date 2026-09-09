# 数据、安全与隐私说明

## 1. 浏览器本地数据

前端主要使用以下持久化键：

```text
discrete_math_ai_sessions_v1
discrete_math_ai_learning_v1
discrete_math_ai_appearance_v1
```

分别用于会话、学习状态/错题、外观参数。

自定义背景图片使用 IndexedDB：

```text
discrete_math_ai_appearance_assets_v1
```

## 2. 服务端与第三方模型数据流

### 文本对话

```text
浏览器
→ Flask /chat
→ teaching.py 本地规则分析
→ DeepSeek Chat Completions API
→ Flask
→ 浏览器
```

### 图片题

```text
浏览器图片
→ Flask /ocr
→ PaddleOCR CPU 推理
→ DeepSeek Vision（开启时）
→ Flask
→ 浏览器
```

因此，“学习状态主要保存在浏览器本地”与“模型请求会发送到第三方AI服务”是两个不同的数据层。

## 3. API Key

`DEEPSEEK_API_KEY` 由 `ai.py` 从服务端环境变量读取：

```python
os.environ.get("DEEPSEEK_API_KEY")
```

前端 JavaScript 不保存该密钥。

## 4. HTML安全处理

AI文本经 Marked 解析后，使用 DOMPurify 对 HTML 进行清洗，再进入页面 DOM。

```text
Marked → DOMPurify → MathJax
```

Marked 官方文档明确说明其本身不负责对输出HTML进行安全清洗；DOMPurify用于HTML/MathML/SVG的XSS清洗。

## 5. 请求限制

### 聊天

- 单次最多 32 条消息；
- 单条最多 6000 字符；
- 20 次 / 60 秒 / 客户端IP。

### 图片

- 单张最大 8 MiB；
- OCR处理前最长边会缩放到最多 2200 px；
- 10 次 / 60 秒 / 客户端IP。

## 6. 限流实现

限流记录由 `app.py` 中的 `defaultdict(deque)` 保存在当前 Python 进程内存中，窗口为 60 秒。

客户端IP解析：

1. 优先取 `X-Forwarded-For` 的第一个地址；
2. 否则使用 `request.remote_addr`。

## 7. OCR 故障隔离

- PaddleOCR文字模型属于基础OCR能力；
- 公式识别导入或加载失败时，普通文字OCR仍可工作；
- DeepSeek Vision异常时，系统继续返回OCR结果；
- `/ready` 暴露Web/OCR就绪状态，不返回API Key。

## 8. 学习画像边界

知识图谱用于课程知识组织、建议前置知识和学习路径展示；当前 JSON 描述明确规定不记录学生“掌握度”。学习回顾依据浏览器真实学习记录生成，不使用虚构的能力百分比。
