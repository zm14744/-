# 直接依赖与前端库许可证清单

本文件覆盖项目源代码中**直接声明的 Python 依赖**与 `index.html` 中**直接加载的前端库**。各第三方项目的著作权归相应权利人所有，许可证以各项目官方仓库/官方文档为准。

## Python 直接依赖

| 组件 | 项目使用版本 | 许可证 | 官方来源 |
|---|---:|---|---|
| Flask | 3.1.2 | BSD-3-Clause | https://flask.palletsprojects.com/en/stable/license/ |
| Requests | 2.32.5 | Apache-2.0 | https://github.com/psf/requests/blob/main/pyproject.toml |
| Gunicorn | 23.0.0 | MIT | https://github.com/benoitc/gunicorn/blob/master/LICENSE |
| PaddlePaddle | 3.3.1 | Apache-2.0 | https://github.com/PaddlePaddle/Paddle |
| PaddleOCR | 3.7.0 | Apache-2.0 | https://github.com/PaddlePaddle/PaddleOCR/blob/main/pyproject.toml |
| NumPy | 1.26.4 | BSD-3-Clause（NumPy主体；发布wheel同时包含其随包许可证文件） | https://github.com/numpy/numpy |
| OpenCV / opencv-contrib-python | 4.10.0.84 | Apache-2.0（OpenCV 4.5.0及以上） | https://opencv.org/license/ |
| Pillow | 11.3.0 | MIT-CMU | https://github.com/python-pillow/Pillow/blob/main/LICENSE |

## 前端直接加载库

| 组件 | 项目使用版本 | 许可证 | 官方来源 |
|---|---:|---|---|
| MathJax | 3.2.2 | Apache-2.0 | https://github.com/mathjax/MathJax |
| Marked | 15.0.12 | MIT | https://github.com/markedjs/marked/blob/master/package.json |
| DOMPurify | 3.2.6 | Apache-2.0 OR MPL-2.0 | https://github.com/cure53/DOMPurify |
| html2canvas | 1.4.1 | MIT | https://github.com/niklasvh/html2canvas/blob/master/package.json |
| jsPDF | 2.5.2 | MIT | https://github.com/parallax/jsPDF |

## 第三方AI服务

### DeepSeek API

DeepSeek 是系统运行时调用的第三方 AI API 服务，不作为本项目开源库重新分发。项目使用官方 Chat Completions API：

- `deepseek-v4-flash`
- `deepseek-v4-flash-vision-exp`

官方API：

https://api-docs.deepseek.com/api/create-chat-completion/

开放平台服务条款：

https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html

## 开源许可证处理方式

项目使用的上述直接依赖均保留其原项目名称、版本与许可证信息。代码材料中不将第三方框架、模型或前端库表述为项目自主研发成果。

Apache-2.0、MIT、BSD-3-Clause、MIT-CMU 等许可证均以原项目的许可证文本为准；分发第三方源代码或二进制内容时，应同时满足相应许可证中的版权声明、许可证文本和NOTICE等适用要求。
