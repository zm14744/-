import easyocr
import cv2
import numpy as np
import re

# 只加载一次
reader = easyocr.Reader(['ch_sim','en'], gpu=False, verbose=False)


def preprocess(img):

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 降低计算量
    gray = cv2.resize(gray, None, fx=1.8, fy=1.8)

    gray = cv2.GaussianBlur(gray, (3,3), 0)

    gray = cv2.adaptiveThreshold(
        gray,255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,2
    )

    return gray


def clean_math(text):

    text = re.sub(r'\s+', ' ', text)

    text = text.replace("sqrt", "√")
    text = text.replace("integral", "∫")
    text = text.replace(" O ", " 0 ")
    text = text.replace(" l ", " 1 ")

    return text.strip()


def ocr_text(file):

    path = "temp.jpg"
    file.save(path)

    img = cv2.imread(path)

    if img is None:
        return "图片读取失败"

    processed = preprocess(img)

    result = reader.readtext(
        processed,
        detail=0,
        paragraph=True,
        batch_size=4
    )

    text = " ".join(result)

    return clean_math(text)
