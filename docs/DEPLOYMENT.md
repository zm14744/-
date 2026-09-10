# 部署说明

## 1. 当前部署形态

- Web 框架：Flask 3.1.2
- WSGI Server：Gunicorn 23.0.0
- 容器基础镜像：`python:3.10-slim`
- OCR：PaddlePaddle / PaddleOCR CPU 推理
- 当前部署平台：Zeabur
- 部署历程：Render → Zeabur
- 当前在线域名：https://discrete-math-tutor.zeabur.app
- 当前服务器：Tencent Seoul 2C 4GB
- 当前服务器配置：2 核 CPU / 4 GB 内存
- 当前服务器费用：US$4/月
- 当前区域：Seoul, KR

### 部署迁移记录

项目早期曾部署于 Render，后迁移至 Zeabur。当前文档以 Zeabur 线上环境为准。

### 当前外部模型费用记录

截至 2026-09-10，项目 DeepSeek API 累计实际支出为 **¥101.56**。该数字用于记录项目真实开发、调试和运行投入，不等同于单用户成本或规模化商业成本。

## 2. Dockerfile 行为

容器设置：

```text
PYTHONUNBUFFERED=1
PYTHONDONTWRITEBYTECODE=1
PIP_NO_CACHE_DIR=1
PADDLE_PDX_MODEL_SOURCE=BOS
FLAGS_use_mkldnn=0
OMP_NUM_THREADS=1
MKL_NUM_THREADS=1
OPENBLAS_NUM_THREADS=1
NUMEXPR_NUM_THREADS=1
```

系统包：

```text
libgl1
libglib2.0-0
libgomp1
libsm6
libxext6
libxrender1
```

这些库用于 OpenCV、PaddleOCR 与图像处理相关运行依赖。

## 3. Gunicorn

启动命令：

```text
gunicorn -w 1 --threads 2 --timeout 300 -b 0.0.0.0:${PORT:-8080} app:app
```

参数：

- 1 个 worker；
- 2 个线程；
- 请求超时 300 秒；
- 监听环境变量 `PORT`，默认 8080。

## 4. 环境变量

```text
DEEPSEEK_API_KEY
DEEPSEEK_VISION_MODEL
VISION_ANALYSIS_ENABLED
DEEPSEEK_MAX_OUTPUT_TOKENS
PORT
```

其中代码实际变量名为：

```text
DEEPSEEK_API_KEY
DEEPSEEK_VISION_MODEL
VISION_ANALYSIS_ENABLED
DEEPSEEK_MAX_OUTPUT_TOKENS
PORT
```

## 5. 本地运行

```bash
python -m pip install -r requirements.txt
export DEEPSEEK_API_KEY="your-key"
python app.py
```

直接运行 `app.py` 时：

- host：`0.0.0.0`
- 默认端口：5000
- `debug=False`

## 6. Docker运行

```bash
docker build -t discrete-math-tutor .
docker run --rm \
  -p 8080:8080 \
  -e PORT=8080 \
  -e DEEPSEEK_API_KEY="your-key" \
  discrete-math-tutor
```

## 7. OCR 启动

`app.py` 启动后会在后台线程预热 OCR 模型。`/ready` 用于观察：

- OCR模块是否可导入；
- OCR模型是否完成预热；
- 公式识别是否处于正常或降级状态。

OCR文字模型：

```text
PP-OCRv6_small_det
PP-OCRv6_small_rec
```

公式模型：

```text
PP-FormulaNet_plus-S
```

## 8. 健康检查

```bash
curl https://discrete-math-tutor.zeabur.app/health
curl https://discrete-math-tutor.zeabur.app/ready
```

## 9. 关键静态检查

```bash
python -m py_compile ai.py app.py teaching.py ocr.py
node --check static/script.js
```

当前源码执行上述语法检查通过；`knowledge_graph.json` 可正常解析为 10 个模块、64 个节点。
