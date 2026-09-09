# 代码验证与测试说明

## 1. 当前代码静态验证

对当前代码执行：

```bash
python -m py_compile ai.py app.py teaching.py ocr.py
node --check static/script.js
```

结果：Python 与 JavaScript 语法检查通过。

`knowledge_graph.json` 解析结果：

```text
10 个模块
64 个知识节点
```

## 2. 校内选拔自测清单

项目建立了 120 项自测用例，覆盖：

- 核心教学；
- OCR与多模态；
- 上下文与错题闭环；
- 前端与PDF；
- 部署稳定性；
- 知识图谱专项。

项目负责人提供的自测记录为全部通过。

## 3. 核心验收链

```text
文字题 / 图片题 / AI出题
→ 知识识别
→ 提示式辅导
→ 完整解析（用户明确要求时）
→ 记为错题
→ 完成订正
→ 生成复测题
→ 提交答案并记录复测结果
```

## 4. 当前关键参数

```text
后端消息上限：32条
AI历史消息上限：32条
AI历史字符预算：60000
单条消息：6000字符
前端回退上下文：12条
图片：8MiB
OCR最长边：2200px
聊天限流：20次/60秒
OCR限流：10次/60秒
错题上限：80条
```

## 5. 健康状态接口

```bash
curl https://discrete-math-tutor.zeabur.app/health
curl https://discrete-math-tutor.zeabur.app/ready
```

`/health` 用于Web服务健康状态；`/ready` 用于Web与OCR就绪状态。
