import io
import os
import threading
import time

import cv2
import numpy as np
from PIL import Image, ImageOps

# Zeabur 亚洲节点优先使用 BOS 模型源；
# 若外部环境已配置其他来源，则不覆盖。
os.environ.setdefault("PADDLE_PDX_MODEL_SOURCE", "BOS")
os.environ.setdefault("FLAGS_use_mkldnn", "0")

from paddleocr import PaddleOCR

_formula_import_error = None
try:
    from paddleocr import FormulaRecognitionPipeline
except Exception as exc:
    # 公式模块导入失败时，仍允许普通文字 OCR 工作。
    FormulaRecognitionPipeline = None
    _formula_import_error = repr(exc)


TEXT_DET_MODEL = "PP-OCRv6_small_det"
TEXT_REC_MODEL = "PP-OCRv6_small_rec"
FORMULA_MODEL = "PP-FormulaNet_plus-S"

MAX_IMAGE_SIDE = 2200
MIN_TEXT_SCORE = 0.45
FORMULA_RETRY_SECONDS = 300

_text_ocr = None
_formula_ocr = None

_formula_load_attempted = False
_formula_load_error = _formula_import_error
_formula_last_attempt = 0.0

_model_lock = threading.Lock()
_inference_lock = threading.Lock()


class OCRError(Exception):
    """OCR 对外统一使用中文错误。"""
    pass


def load_models():
    """
    加载 OCR 模型。

    普通文字模型是必需的：
    - 加载失败时直接抛出异常。

    公式模型是可降级的：
    - 导入失败时保持普通文字 OCR 可用；
    - 运行时加载失败后进入降级模式；
    - 对可能的临时网络/下载故障，5 分钟后允许再次尝试加载。
    """
    global _text_ocr
    global _formula_ocr
    global _formula_load_attempted
    global _formula_load_error
    global _formula_last_attempt

    now = time.monotonic()

    if _text_ocr is not None and _formula_ocr is not None:
        return {
            "text_ready": True,
            "formula_ready": True,
        }

    if (
        _text_ocr is not None
        and _formula_load_attempted
        and FormulaRecognitionPipeline is None
    ):
        return {
            "text_ready": True,
            "formula_ready": False,
        }

    if (
        _text_ocr is not None
        and _formula_load_attempted
        and _formula_ocr is None
        and now - _formula_last_attempt < FORMULA_RETRY_SECONDS
    ):
        return {
            "text_ready": True,
            "formula_ready": False,
        }

    with _model_lock:
        if _text_ocr is None:
            print("正在加载 PP-OCRv6-small...")
            _text_ocr = PaddleOCR(
                text_detection_model_name=TEXT_DET_MODEL,
                text_recognition_model_name=TEXT_REC_MODEL,
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                text_recognition_batch_size=1,
                device="cpu",
                enable_mkldnn=False,
                cpu_threads=2,
            )
            print("PP-OCRv6-small 加载完成")

        now = time.monotonic()
        should_try_formula = (
            _formula_ocr is None
            and FormulaRecognitionPipeline is not None
            and (
                not _formula_load_attempted
                or now - _formula_last_attempt >= FORMULA_RETRY_SECONDS
            )
        )

        if FormulaRecognitionPipeline is None:
            if not _formula_load_attempted:
                _formula_load_attempted = True
                _formula_last_attempt = now
                _formula_load_error = (
                    _formula_import_error
                    or "FormulaRecognitionPipeline 不可用"
                )
                print(
                    "PP-FormulaNet_plus-S 未能加载，"
                    f"已启用普通文字 OCR 降级：{_formula_load_error}"
                )

        elif should_try_formula:
            _formula_load_attempted = True
            _formula_last_attempt = now

            try:
                print("正在加载 PP-FormulaNet_plus-S...")
                _formula_ocr = FormulaRecognitionPipeline(
                    formula_recognition_model_name=FORMULA_MODEL,
                    formula_recognition_batch_size=1,
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_layout_detection=True,
                    device="cpu",
                    enable_mkldnn=False,
                    cpu_threads=2,
                )
                _formula_load_error = None
                print("PP-FormulaNet_plus-S 加载完成")
            except Exception as exc:
                _formula_ocr = None
                _formula_load_error = repr(exc)
                print(
                    "PP-FormulaNet_plus-S 加载失败，"
                    f"已启用普通文字 OCR 降级：{repr(exc)}"
                )

    return {
        "text_ready": _text_ocr is not None,
        "formula_ready": _formula_ocr is not None,
    }


def _decode_image(image_data):
    """
    支持：
    - bytes / bytearray
    - Flask FileStorage（具有 read()）
    - numpy.ndarray
    """
    if isinstance(image_data, np.ndarray):
        image = image_data.copy()
    else:
        if hasattr(image_data, "read"):
            raw = image_data.read()
        elif isinstance(image_data, (bytes, bytearray)):
            raw = bytes(image_data)
        else:
            raise OCRError("无法读取该图片。")

        if not raw:
            raise OCRError("图片内容为空，请重新上传。")

        try:
            # 处理手机照片 EXIF 方向，再转换为 OpenCV BGR。
            pil_image = Image.open(io.BytesIO(raw))
            pil_image = ImageOps.exif_transpose(pil_image).convert("RGB")
            image = cv2.cvtColor(
                np.asarray(pil_image),
                cv2.COLOR_RGB2BGR
            )
        except Exception as exc:
            print(f"图片解码失败：{repr(exc)}")
            raise OCRError(
                "图片读取失败，请重新选择图片。"
            ) from None

    if image is None or image.size == 0:
        raise OCRError("图片读取失败，请重新选择图片。")

    return image


def _resize_if_needed(image):
    """
    图片过大时只缩小，不强制放大、模糊或二值化，
    尽量保留数学符号、上下标和细线。
    """
    height, width = image.shape[:2]
    longest = max(height, width)

    if longest <= MAX_IMAGE_SIDE:
        return image

    scale = MAX_IMAGE_SIDE / float(longest)
    new_width = max(1, int(width * scale))
    new_height = max(1, int(height * scale))

    return cv2.resize(
        image,
        (new_width, new_height),
        interpolation=cv2.INTER_AREA
    )


def _result_json(result):
    """兼容 PaddleOCR Result 对象的 json 属性。"""
    payload = getattr(result, "json", None)

    if callable(payload):
        payload = payload()

    if not isinstance(payload, dict):
        return {}

    if isinstance(payload.get("res"), dict):
        return payload["res"]

    return payload


def _normalize_box(box):
    """统一为 [x1, y1, x2, y2]。"""
    try:
        arr = np.asarray(box, dtype=float).reshape(-1, 2)
        x1 = float(np.min(arr[:, 0]))
        y1 = float(np.min(arr[:, 1]))
        x2 = float(np.max(arr[:, 0]))
        y2 = float(np.max(arr[:, 1]))
        return [x1, y1, x2, y2]
    except Exception:
        try:
            values = np.asarray(box, dtype=float).reshape(-1)
            if len(values) >= 4:
                return [
                    float(values[0]),
                    float(values[1]),
                    float(values[2]),
                    float(values[3]),
                ]
        except Exception:
            pass

    return None


def _intersection_ratio(box_a, box_b):
    """
    计算 box_a 被 box_b 覆盖的比例，
    用于删除被公式区域覆盖的普通 OCR 结果。
    """
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)

    intersection = iw * ih
    area_a = max(1.0, (ax2 - ax1) * (ay2 - ay1))

    return intersection / area_a


def _extract_text_items(image):
    """提取 PP-OCRv6-small 的普通文字及坐标。"""
    output = _text_ocr.predict(
        image,
        text_rec_score_thresh=MIN_TEXT_SCORE,
    )

    items = []

    for result in output:
        data = _result_json(result)

        texts = data.get("rec_texts") or []
        scores = data.get("rec_scores")
        boxes = data.get("rec_boxes")

        if scores is None:
            scores = [1.0] * len(texts)
        if boxes is None:
            boxes = []

        scores = list(np.asarray(scores).reshape(-1))

        for index, text in enumerate(texts):
            text = str(text).strip()
            if not text:
                continue

            score = (
                float(scores[index])
                if index < len(scores)
                else 1.0
            )

            if score < MIN_TEXT_SCORE:
                continue

            if index >= len(boxes):
                continue

            box = _normalize_box(boxes[index])
            if box is None:
                continue

            items.append({
                "type": "text",
                "content": text,
                "box": box,
                "score": score,
            })

    return items


def _extract_formula_items(image):
    """提取 PP-FormulaNet_plus-S 的 LaTeX 公式及坐标。"""
    if _formula_ocr is None:
        return []

    output = _formula_ocr.predict(
        image,
        use_layout_detection=True,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
    )

    items = []

    for result in output:
        data = _result_json(result)

        for formula in data.get("formula_res_list") or []:
            latex = str(
                formula.get("rec_formula", "")
            ).strip()

            if not latex:
                continue

            box = _normalize_box(
                formula.get("dt_polys")
            )
            if box is None:
                continue

            items.append({
                "type": "formula",
                "content": latex,
                "box": box,
            })

    return items


def _remove_text_inside_formulas(text_items, formula_items):
    if not formula_items:
        return text_items

    formula_boxes = [
        item["box"] for item in formula_items
    ]
    kept = []

    for text_item in text_items:
        text_box = text_item["box"]

        covered = any(
            _intersection_ratio(
                text_box,
                formula_box
            ) >= 0.45
            for formula_box in formula_boxes
        )

        if not covered:
            kept.append(text_item)

    return kept


def _sort_reading_order(items):
    """
    根据识别框平均高度动态分行，
    适配不同分辨率和字号的单栏教材/试卷。
    """
    if not items:
        return []

    def center_y(item):
        box = item["box"]
        return (box[1] + box[3]) / 2.0

    def height(item):
        box = item["box"]
        return max(1.0, box[3] - box[1])

    rough = sorted(
        items,
        key=lambda item: (
            center_y(item),
            item["box"][0]
        )
    )

    avg_height = (
        sum(height(item) for item in rough)
        / len(rough)
    )
    line_threshold = max(
        8.0,
        avg_height * 0.55
    )

    lines = []

    for item in rough:
        cy = center_y(item)
        placed = False

        for line in lines:
            if (
                abs(cy - line["center_y"])
                <= line_threshold
            ):
                line["items"].append(item)
                line["center_y"] = (
                    sum(
                        center_y(x)
                        for x in line["items"]
                    )
                    / len(line["items"])
                )
                placed = True
                break

        if not placed:
            lines.append({
                "center_y": cy,
                "items": [item],
            })

    lines.sort(
        key=lambda line: line["center_y"]
    )

    ordered = []
    for line in lines:
        line["items"].sort(
            key=lambda item: item["box"][0]
        )
        ordered.extend(line["items"])

    return ordered


def _formula_to_markdown(latex, box, image_width):
    """
    较宽或复杂公式使用块公式，
    短公式使用行内公式。
    """
    width = max(
        0.0,
        box[2] - box[0]
    )

    is_complex = (
        width >= image_width * 0.45
        or "\\begin{" in latex
        or "\\\\" in latex
    )

    if is_complex:
        return f"$$\n{latex}\n$$"

    return f"${latex}$"


def _compose_markdown(items, image_width):
    if not items:
        return ""

    parts = []

    for item in _sort_reading_order(items):
        if item["type"] == "formula":
            content = _formula_to_markdown(
                item["content"],
                item["box"],
                image_width
            )
        else:
            content = item["content"]

        if content:
            parts.append(content)

    return "\n".join(parts).strip()


def recognize_image(image_data):
    """
    OCR 主入口。

    返回：
        {
            "text": "Markdown + LaTeX",
            "text_count": 普通文字区域数量,
            "formula_count": 公式区域数量,
            "warning": 公式模块降级时的中文提示，否则为 None
        }

    只负责识题，不调用 DeepSeek，也不生成答案。
    """
    # 普通文字模型失败时让异常继续抛给 app.py；
    # 公式模型失败由 load_models() 内部自动降级。
    load_models()

    image = _decode_image(image_data)
    image = _resize_if_needed(image)

    try:
        with _inference_lock:
            text_items = _extract_text_items(image)

            formula_items = []
            formula_warning = None

            if _formula_ocr is None:
                formula_warning = (
                    "公式识别模块暂时不可用，"
                    "已使用普通文字识别，请检查数学公式。"
                )
            else:
                try:
                    formula_items = _extract_formula_items(
                        image
                    )
                except Exception as exc:
                    print(
                        "公式识别失败，"
                        f"已降级为普通文字 OCR：{repr(exc)}"
                    )
                    formula_warning = (
                        "部分数学公式未能自动识别，"
                        "请检查识别结果。"
                    )

        text_items = _remove_text_inside_formulas(
            text_items,
            formula_items
        )

        all_items = text_items + formula_items

        text = _compose_markdown(
            all_items,
            image.shape[1]
        )

        if not text:
            raise OCRError(
                "没有识别到清晰的题目内容，"
                "请尝试重新拍摄或裁剪图片。"
            )

        return {
            "text": text,
            "text_count": len(text_items),
            "formula_count": len(formula_items),
            "warning": formula_warning,
        }

    except OCRError:
        raise

    except Exception as exc:
        print(f"OCR 识别异常：{repr(exc)}")
        raise OCRError(
            "题目识别暂时失败，请稍后重试。"
        ) from None
