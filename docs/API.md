# API 说明

基础服务由 `app.py` 提供。

## GET `/`

返回主页面，并把 `knowledge_graph.json` 中的知识图谱数据注入模板。

## POST `/chat`

### 请求

Content-Type：`application/json`

```json
{
  "messages": [
    {"role": "user", "content": "给我一道和上一题同知识点的练习题"}
  ],
  "request_kind": "exercise",
  "exercise_reference": {
    "question": "上一道已定位题目的完整题干"
  }
}
```

`request_kind="exercise"` 表示前端明确声明本轮为出题请求。`exercise_reference` 为可选字段，仅用于需要参照某一道已有题生成同知识点题/复测题的场景；普通聊天和不需要参照题的独立出题可以省略。

### 输入规则

- `messages` 必须是数组；
- 有效角色为 `user`、`assistant`；
- 单次最多保留最近 32 条；
- 单条消息最多 6000 字符；
- 空内容会被忽略；
- `exercise_reference` 若存在，则必须同时满足 `request_kind="exercise"`，且格式为包含非空 `question` 字符串的对象；参照题题干同样受 6000 字符上限约束；
- 后端不会信任前端传入的知识分类，而会对 `exercise_reference.question` 重新执行 `analyze_question()`；
- 使用参照题时，后端把模型上下文收束为“当前指向题目 + 本轮唯一需要执行的用户请求”，减少其他历史题干扰；
- 聊天限流：20 次 / 60 秒 / 客户端IP。

### 普通成功响应

```json
{
  "reply": "...",
  "teaching": {
    "mode": "concept",
    "mode_label": "概念讲解"
  },
  "generated_exercise": false
}
```

### AI 生成题成功响应

```json
{
  "reply": "【题目】\n\n...",
  "teaching": {...},
  "generated_exercise": true,
  "generated_question": "...",
  "generated_teaching": {...},
  "generated_answer": "..."
}
```

`generated_answer` 是后端从模型输出中分离出的参考答案信息；初次展示给学生的 `reply` 仅包含题目。错题复测流程会把该字段保存在复测会话内部，用于后续核验学生对本次复测题的作答，但不会在出题阶段直接展示给学生。

### 主要错误状态

- 400：请求格式错误、无有效消息、单条消息超过6000字符、练习参照题格式错误或参照题与本轮要求组合过长；
- 429：请求频率超过限制；
- 500：服务编排或生成题登记异常；
- 502：模型返回空内容或生成题缺少有效题干；
- 503：AI服务不可用。

## POST `/analyze-questions`

批量使用 `teaching.py` 重新识别历史题目，不调用大模型。

### 请求

```json
{
  "questions": [
    {"key": "q1", "text": "判断关系R是否自反、对称和传递"}
  ]
}
```

一次最多处理前 80 项；单题分析文本截取前 6000 字符。

### 响应

```json
{
  "results": [
    {"key": "q1", "teaching": {...}}
  ]
}
```

## POST `/ocr`

Content-Type：`multipart/form-data`

上传字段支持：

- `image`
- `file`

### 输入规则

- 文件必须非空；
- 单张图片最大 8 MiB；
- Flask 总请求上限为 8 MiB + 512 KiB multipart 开销；
- OCR 限流：10 次 / 60 秒 / 客户端IP。

### 成功响应

```json
{
  "text": "校对后的题目文字或OCR文字",
  "visual_text": "图形结构说明",
  "text_count": 12,
  "formula_count": 2,
  "vision_used": true,
  "warning": null
}
```

Vision 结果为空或调用异常时，`text` 仍可使用 OCR 结果。

### 主要错误状态

- 400：无文件、空文件、图片解码/OCR输入错误；
- 413：超过 8 MiB；
- 429：OCR请求频率超过限制；
- 500：OCR接口内部异常；
- 503：OCR模块不可用。

## GET `/health`

```json
{"status": "ok"}
```

## GET `/ready`

```json
{
  "web": "正常",
  "ocr_available": true,
  "ocr_ready": true,
  "ocr_status": "已就绪"
}
```

`ocr_status` 也可以反映公式识别降级状态。
