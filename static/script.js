marked.setOptions({
    gfm: true,
    breaks: true
});

const STORAGE_KEY = "discrete_math_ai_sessions_v1";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

let sessions = [];
let currentId = null;

let typingTimer = null;
let typingFullText = "";
let typingDiv = null;
let typingSessionId = null;
let typingMeta = null;

let requestBusy = false;


// -----------------------------
// 基础状态
// -----------------------------
function getCurrent() {
    return sessions.find(s => s.id === currentId) || null;
}

function makeSessionId() {
    let id = Date.now();

    while (sessions.some(s => s.id === id)) {
        id += 1;
    }

    return id;
}

function enableInput(enable) {
    const input = document.getElementById("text");
    const sendBtn = document.getElementById("sendBtn");
    const imageBtn = document.getElementById("imageBtn");

    if (input) input.disabled = !enable;
    if (sendBtn) sendBtn.disabled = !enable;
    if (imageBtn) imageBtn.disabled = !enable;
}

function setBusy(busy) {
    requestBusy = busy;

    if (busy) {
        enableInput(false);
    } else if (!typingTimer) {
        enableInput(true);
    }
}

function normalizeTeaching(value) {
    if (!value || typeof value !== "object") {
        return null;
    }

    const asText = input => (
        typeof input === "string" ? input.trim() : ""
    );

    const asTextList = input => (
        Array.isArray(input)
            ? input
                .filter(item => typeof item === "string" && item.trim())
                .map(item => item.trim())
                .slice(0, 4)
            : []
    );

    return {
        category: asText(value.category) || "待识别",
        related_categories: asTextList(value.related_categories),
        knowledge_points: asTextList(value.knowledge_points),
        prerequisite_points: asTextList(value.prerequisite_points),
        knowledge_path: asTextList(value.knowledge_path),
        question_type: asText(value.question_type) || "综合题",
        mode: asText(value.mode) || "hint",
        mode_label: asText(value.mode_label) || "提示引导",
        confidence: asText(value.confidence) || "低",
        input_source: asText(value.input_source) || "文本输入"
    };
}

function getFriendlyCategory(value) {
    const text = String(value || "").trim();

    if (!text || text === "待识别") {
        return "暂时没判断出来";
    }

    return text;
}

function getFriendlyQuestionType(value) {
    const text = String(value || "").trim();

    if (!text) {
        return "综合问题";
    }

    if (text === "综合题") {
        return "综合问题";
    }

    if (text === "出题请求") {
        return "练习题需求";
    }

    if (text === "答案检查") {
        return "答案检查";
    }

    return text;
}

function getFriendlyMode(value) {
    const text = String(value || "").trim();

    if (!text || text === "提示引导") {
        return "先给思路和提示";
    }

    if (text === "完整解析") {
        return "直接讲完整解法";
    }

    if (text === "概念讲解") {
        return "先解释概念";
    }

    if (text === "练习出题") {
        return "给你出练习题";
    }

    if (text === "答案诊断") {
        return "帮你检查答案";
    }

    return text;
}

function getFriendlyConfidence(value) {
    const text = String(value || "").trim();

    if (!text || text === "低") {
        return "不太确定";
    }

    if (text === "中") {
        return "比较确定";
    }

    if (text === "高") {
        return "较确定";
    }

    return text;
}

function getFriendlyInputSource(value) {
    const text = String(value || "").trim();

    if (!text || text === "文本输入") {
        return "手动输入";
    }

    if (text === "图片识题") {
        return "图片识题";
    }

    return text;
}


// -----------------------------
// 本地持久化
// -----------------------------
function saveState() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                sessions,
                currentId
            })
        );
    } catch (error) {
        console.warn("本地会话保存失败：", error);
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;

        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.sessions)) {
            return false;
        }

        const loadedSessions = [];

        for (const session of data.sessions) {
            if (
                !session
                || typeof session !== "object"
                || !Array.isArray(session.messages)
            ) {
                continue;
            }

            const messages = [];

            for (const message of session.messages) {
                if (
                    !message
                    || typeof message !== "object"
                    || !["user", "ai"].includes(message.role)
                ) {
                    continue;
                }

                const text = typeof message.text === "string"
                    ? message.text
                    : String(message.text ?? "");

                if (!text.trim()) continue;

                messages.push({
                    role: message.role,
                    text,
                    source: message.source === "ocr" ? "ocr" : undefined,
                    isError: Boolean(message.isError),
                    isNotice: Boolean(message.isNotice)
                });
            }

            loadedSessions.push({
                id: session.id,
                name: typeof session.name === "string" && session.name.trim()
                    ? session.name
                    : "新对话",
                messages,
                teaching: normalizeTeaching(session.teaching)
            });
        }

        sessions = loadedSessions;

        // 允许“零会话”作为一个合法的持久化状态。
        // 这样用户删除最后一个对话后，刷新页面也不会自动长回来。
        if (!sessions.length) {
            currentId = null;
            return true;
        }

        const savedIdExists = sessions.some(
            session => session.id === data.currentId
        );

        currentId = savedIdExists
            ? data.currentId
            : sessions[0].id;

        return true;

    } catch (error) {
        console.warn("本地会话读取失败：", error);
        return false;
    }
}


// -----------------------------
// Markdown / MathJax
// -----------------------------
function escapeRawHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function protectMathForMarkdown(source) {
    const mathSegments = [];

    const stash = match => {
        const index = mathSegments.length;
        mathSegments.push(match);
        return `MATHPROTECTTOKEN${index}ENDTOKEN`;
    };

    let protectedText = String(source ?? "");

    // 在 marked 解析 Markdown 之前先藏起公式。
    // 否则 _、*、\begin{cases} 等可能被 Markdown 当成强调语法。
    protectedText = protectedText.replace(
        /\$\$[\s\S]*?\$\$/g,
        stash
    );

    protectedText = protectedText.replace(
        /\\\[[\s\S]*?\\\]/g,
        stash
    );

    protectedText = protectedText.replace(
        /\\\([\s\S]*?\\\)/g,
        stash
    );

    protectedText = protectedText.replace(
        /\$(?!\$)(?:\\.|[^$\n])+\$/g,
        stash
    );

    return {
        protectedText,
        mathSegments
    };
}

function restoreMathAfterMarkdown(html, mathSegments) {
    let restored = String(html ?? "");

    for (let index = 0; index < mathSegments.length; index += 1) {
        const token = `MATHPROTECTTOKEN${index}ENDTOKEN`;
        const safeMath = escapeRawHtml(mathSegments[index]);

        restored = restored
            .split(token)
            .join(safeMath);
    }

    return restored;
}

function markdownToHtml(text) {
    const source = String(text ?? "");

    const {
        protectedText,
        mathSegments
    } = protectMathForMarkdown(source);

    const rawHtml = marked.parse(protectedText);

    const safeHtml = window.DOMPurify
        ? window.DOMPurify.sanitize(rawHtml)
        : marked.parse(escapeRawHtml(protectedText));

    return restoreMathAfterMarkdown(
        safeHtml,
        mathSegments
    );
}

function renderMath(target) {
    if (!window.MathJax || !MathJax.typesetPromise) {
        return;
    }

    MathJax.typesetPromise(
        target ? [target] : undefined
    ).catch(error => {
        console.warn("MathJax 渲染失败：", error);
    });
}

function scrollChatToBottom() {
    const chat = document.getElementById("chat");
    if (chat) {
        chat.scrollTop = chat.scrollHeight;
    }
}


// -----------------------------
// 新对话
// -----------------------------
function newChat() {
    if (typingTimer) {
        forceCompleteTyping();
    }

    const id = makeSessionId();

    sessions.push({
        id,
        name: "新对话",
        messages: [],
        teaching: null
    });

    currentId = id;

    saveState();
    renderAll();
}


// -----------------------------
// 发送聊天
// -----------------------------
function buildApiMessages(session) {
    return session.messages
        .filter(message => !message.isError && !message.isNotice)
        .slice(-16)
        .map(message => {
            let content = message.text;

            if (
                message.role === "user"
                && message.source === "ocr"
            ) {
                content = `[图片识题]\n${content}`;
            }

            return {
                role: message.role === "user"
                    ? "user"
                    : "assistant",
                content
            };
        });
}

async function parseResponseJson(response) {
    try {
        return await response.json();
    } catch (_error) {
        return {};
    }
}

function fallbackHttpError(status) {
    if (status === 400) {
        return "请求内容有误，请检查后重新发送。";
    }
    if (status === 413) {
        return "上传内容过大，请重新选择。";
    }
    if (status === 429) {
        return "当前请求过于频繁，请稍后再试。";
    }
    if (status >= 500) {
        return "服务暂时不可用，请稍后重试。";
    }

    return "请求失败，请稍后重试。";
}

async function requestAiReply(session) {
    if (!session) return;

    setBusy(true);

    try {
        const response = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: buildApiMessages(session)
            })
        });

        const data = await parseResponseJson(response);

        if (data.teaching) {
            session.teaching = normalizeTeaching(data.teaching);
            saveState();
            renderInfo();
        }

        if (!response.ok || data.error) {
            const message = data.error
                || fallbackHttpError(response.status);

            showAssistantMessage(
                session,
                message,
                { isError: true }
            );
            return;
        }

        if (
            typeof data.reply !== "string"
            || !data.reply.trim()
        ) {
            showAssistantMessage(
                session,
                "AI 服务没有返回有效内容，请重新发送。",
                { isError: true }
            );
            return;
        }

        if (currentId === session.id) {
            startTyping(
                data.reply,
                session
            );
        } else {
            addAssistantMessage(
                session,
                data.reply
            );
            saveState();
            renderSessions();
            renderInfo();
        }

    } catch (error) {
        console.error("聊天请求失败：", error);

        showAssistantMessage(
            session,
            "网络连接失败，请检查网络后重试。",
            { isError: true }
        );

    } finally {
        setBusy(false);
    }
}

function send() {
    if (typingTimer || requestBusy) {
        return;
    }

    const input = document.getElementById("text");
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    if (!currentId) {
        newChat();
    }

    const session = getCurrent();
    if (!session) return;

    session.messages.push({
        role: "user",
        text
    });

    input.value = "";

    saveState();
    renderChat();
    renderSessions();
    renderInfo();

    requestAiReply(session);
}


// -----------------------------
// 图片题文字清理
// -----------------------------
function cleanOcrTextForVisual(rawText, hasVisualStructure) {
    const source = String(rawText ?? "").trim();

    // 没有图形结构识别结果时，保留 OCR 原文，避免误删。
    if (!source || !hasVisualStructure) {
        return source;
    }

    // 找第一道小题的编号，例如 (1)、（1）、1.、1、
    const questionMatch = source.match(
        /(?:\(\s*1\s*\)|（\s*1\s*）|(?:^|\s)1\s*[.．、])/m
    );

    if (!questionMatch || typeof questionMatch.index !== "number") {
        return source;
    }

    const questionIndex = questionMatch.index;
    const beforeQuestions = source.slice(0, questionIndex);
    const questions = source.slice(questionIndex).trim();

    // 这类提示语后面通常紧跟题图。OCR 会把图中的 v1、e1、e2……
    // 当成普通文字塞进题干。既然视觉模型已经单独识别了图形结构，
    // 就把“提示语 → 第(1)问”之间的图形 OCR 噪声去掉。
    const cues = [
        "回答下列问题",
        "回答以下问题",
        "完成下列问题",
        "解答下列问题",
        "求解下列问题",
        "回答问题"
    ];

    let bestEnd = -1;

    for (const cue of cues) {
        const index = beforeQuestions.lastIndexOf(cue);

        if (index >= 0) {
            bestEnd = Math.max(bestEnd, index + cue.length);
        }
    }

    if (bestEnd < 0) {
        return source;
    }

    const heading = beforeQuestions
        .slice(0, bestEnd)
        .trim()
        .replace(/[：:]\s*$/, "");

    if (!heading || !questions) {
        return source;
    }

    return `${heading}\n${questions}`;
}


// -----------------------------
// OCR 图片识题
// -----------------------------
function openImagePicker() {
    if (typingTimer || requestBusy) {
        return;
    }

    const imageInput = document.getElementById("imageInput");
    if (imageInput) {
        imageInput.click();
    }
}

async function handleImageSelected(event) {
    const input = event && event.target;
    const file = input && input.files
        ? input.files[0]
        : null;

    if (input) {
        // 允许连续选择同一张图片。
        input.value = "";
    }

    if (!file || typingTimer || requestBusy) {
        return;
    }

    if (
        file.type
        && !file.type.startsWith("image/")
    ) {
        showCurrentError(
            "请选择有效的图片文件。"
        );
        return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
        showCurrentError(
            "图片过大，请上传 8MB 以内的图片。"
        );
        return;
    }

    if (!currentId) {
        newChat();
    }

    const session = getCurrent();
    if (!session) return;

    setBusy(true);

    try {
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch("/ocr", {
            method: "POST",
            body: formData
        });

        const data = await parseResponseJson(response);

        if (!response.ok || data.error) {
            showAssistantMessage(
                session,
                data.error
                    || fallbackHttpError(response.status),
                { isError: true }
            );
            return;
        }

        const rawText = typeof data.text === "string"
            ? data.text.trim()
            : "";

        const visualText = typeof data.visual_text === "string"
            ? data.visual_text.trim()
            : "";

        const text = cleanOcrTextForVisual(
            rawText,
            Boolean(visualText)
        );

        if (!text && !visualText) {
            showAssistantMessage(
                session,
                "没有识别到有效的题目内容，请重新拍摄或裁剪图片。",
                { isError: true }
            );
            return;
        }

        const parts = [];

        if (text) {
            parts.push(`【题目文字】\n${text}`);
        }

        if (visualText) {
            parts.push(`【图形信息】\n${visualText}`);
        }

        const combinedText = parts.join("\n\n");

        session.messages.push({
            role: "user",
            text: combinedText,
            source: "ocr"
        });

        if (
            typeof data.warning === "string"
            && data.warning.trim()
        ) {
            session.messages.push({
                role: "ai",
                text: `识别提示：${data.warning.trim()}`,
                isNotice: true
            });
        }

        saveState();
        renderChat();
        renderSessions();
        renderInfo();

    } catch (error) {
        console.error("OCR 请求失败：", error);

        showAssistantMessage(
            session,
            "图片识别请求失败，请检查网络后重试。",
            { isError: true }
        );
        return;

    } finally {
        setBusy(false);
    }

    // OCR 完成后自动把识别结果交给 AI。
    // 后端 SYSTEM_PROMPT 会把“图片识题”默认处理为提示优先。
    await requestAiReply(session);
}


// -----------------------------
// AI 消息与打字效果
// -----------------------------
function addAssistantMessage(
    session,
    text,
    meta = {}
) {
    if (!session || !text) return;

    session.messages.push({
        role: "ai",
        text,
        isError: Boolean(meta.isError),
        isNotice: Boolean(meta.isNotice)
    });
}

function showAssistantMessage(
    session,
    text,
    meta = {}
) {
    if (!session) return;

    if (currentId === session.id && !typingTimer) {
        startTyping(text, session, meta);
        return;
    }

    addAssistantMessage(
        session,
        text,
        meta
    );

    saveState();
    renderAll();
}

function showCurrentError(text) {
    let session = getCurrent();

    if (!session) {
        newChat();
        session = getCurrent();
    }

    showAssistantMessage(
        session,
        text,
        { isError: true }
    );
}

function startTyping(
    text,
    session,
    meta = {}
) {
    if (!session || !text) return;

    if (currentId !== session.id) {
        addAssistantMessage(
            session,
            text,
            meta
        );
        saveState();
        return;
    }

    if (typingTimer) {
        forceCompleteTyping();
    }

    typingFullText = text;
    typingSessionId = session.id;
    typingMeta = {
        isError: Boolean(meta.isError),
        isNotice: Boolean(meta.isNotice)
    };

    const chat = document.getElementById("chat");
    if (!chat) return;

    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);

    typingDiv = div;

    enableInput(false);

    let index = 0;

    typingTimer = setInterval(() => {
        if (!typingDiv) {
            clearInterval(typingTimer);
            typingTimer = null;
            return;
        }

        if (index < text.length) {
            typingDiv.textContent += text[index];
            index += 1;
            scrollChatToBottom();
            return;
        }

        clearInterval(typingTimer);

        // 修复旧版核心 Bug：
        // 正常打字结束后必须清空 typingTimer，
        // 否则 send() 会永远认为仍在打字。
        typingTimer = null;

        finishTyping();
    }, 10);
}

function finishTyping() {
    const session = sessions.find(
        item => item.id === typingSessionId
    );

    if (typingDiv) {
        typingDiv.innerHTML =
            `<div class="ai-content">${markdownToHtml(typingFullText)}</div>`;
    }

    if (session) {
        addAssistantMessage(
            session,
            typingFullText,
            typingMeta || {}
        );
    }

    const finishedDiv = typingDiv;

    typingFullText = "";
    typingDiv = null;
    typingSessionId = null;
    typingMeta = null;

    saveState();

    renderSessions();
    renderInfo();

    if (!requestBusy) {
        enableInput(true);
    }

    if (finishedDiv) {
        renderMath(finishedDiv);
    }

    scrollChatToBottom();
}

// 强制完成当前打字动画
function forceCompleteTyping() {
    if (!typingTimer) {
        return;
    }

    clearInterval(typingTimer);
    typingTimer = null;

    const session = sessions.find(
        item => item.id === typingSessionId
    );

    if (typingDiv) {
        typingDiv.innerHTML =
            `<div class="ai-content">${markdownToHtml(typingFullText)}</div>`;
    }

    if (session) {
        addAssistantMessage(
            session,
            typingFullText,
            typingMeta || {}
        );
    }

    const finishedDiv = typingDiv;

    typingFullText = "";
    typingDiv = null;
    typingSessionId = null;
    typingMeta = null;

    saveState();

    renderSessions();
    renderInfo();

    if (!requestBusy) {
        enableInput(true);
    }

    if (finishedDiv) {
        renderMath(finishedDiv);
    }

    scrollChatToBottom();
}


// -----------------------------
// 渲染聊天
// -----------------------------
function renderChat() {
    const chat = document.getElementById("chat");
    if (!chat) return;

    if (
        window.MathJax
        && typeof MathJax.typesetClear === "function"
    ) {
        try {
            MathJax.typesetClear([chat]);
        } catch (error) {
            console.warn("MathJax 清理旧公式失败：", error);
        }
    }

    chat.innerHTML = "";

    const session = getCurrent();

    if (!session) {
        chat.innerHTML =
            '<div class="empty-tip">暂无对话</div>';
        return;
    }

    for (const message of session.messages) {
        const div = document.createElement("div");
        div.className =
            "msg " + (
                message.role === "user"
                    ? "user"
                    : "ai"
            );

        if (message.role === "user") {
            // 用户文本绝不直接写入 innerHTML，避免 HTML 注入。
            div.textContent = message.text;
            div.style.whiteSpace = "pre-wrap";
        } else {
            div.innerHTML =
                `<div class="ai-content">${markdownToHtml(message.text)}</div>`;
        }

        chat.appendChild(div);
    }

    scrollChatToBottom();
    renderMath(chat);
}


// -----------------------------
// 会话列表
// -----------------------------
function renderSessions() {
    const box = document.getElementById("sessions");
    if (!box) return;

    box.innerHTML = "";

    for (const session of sessions) {
        const div = document.createElement("div");
        div.className = "session";

        const span = document.createElement("span");
        span.innerText = session.name;

        span.onclick = () => {
            if (typingTimer) {
                forceCompleteTyping();
            }

            currentId = session.id;
            saveState();
            renderAll();
        };

        span.ondblclick = () => {
            if (typingTimer) {
                forceCompleteTyping();
            }

            const name = prompt(
                "修改名称：",
                session.name
            );

            if (
                typeof name === "string"
                && name.trim()
            ) {
                session.name = name.trim();
                saveState();
                renderSessions();
                renderInfo();
            }
        };

        const del = document.createElement("button");
        del.className = "del";

        del.onclick = event => {
            event.stopPropagation();

            if (typingTimer) {
                forceCompleteTyping();
            }

            sessions = sessions.filter(
                item => item.id !== session.id
            );

            if (currentId === session.id) {
                currentId = sessions.length
                    ? sessions[0].id
                    : null;
            }

            // 删除最后一个会话时保持空列表，不自动补一个“新对话”。
            // 下一次真正发送文字或上传图片时，send()/handleImageSelected()
            // 会按需调用 newChat() 创建会话。
            if (!sessions.length) {
                currentId = null;
            }

            saveState();
            renderAll();
        };

        div.appendChild(span);
        div.appendChild(del);
        box.appendChild(div);
    }
}


// -----------------------------
// 右侧会话信息
// -----------------------------
function renderInfo() {
    const info = document.getElementById("info");
    if (!info) return;

    const session = getCurrent();

    if (!session) {
        info.innerText = "暂无对话";
        return;
    }

    const lines = [
        `当前对话：${session.name}`,
        `消息数：${session.messages.length}`
    ];

    const teaching = normalizeTeaching(session.teaching);

    if (teaching) {
        lines.push(
            "",
            `这道题主要讲：${getFriendlyCategory(teaching.category)}`,
            `这是什么题：${getFriendlyQuestionType(teaching.question_type)}`
        );

        if (teaching.knowledge_points.length) {
            lines.push(
                `涉及哪些知识：${teaching.knowledge_points.join("、")}`
            );
        }

        if (teaching.prerequisite_points.length) {
            lines.push(
                `做这题前最好会：${teaching.prerequisite_points.join("、")}`
            );
        }

        if (teaching.knowledge_path.length >= 2) {
            lines.push(
                `知识脉络：${teaching.knowledge_path.join(" → ")}`
            );
        }

        lines.push(
            `我会怎么帮你：${getFriendlyMode(teaching.mode_label)}`,
            `判断把握：${getFriendlyConfidence(teaching.confidence)}`
        );

        if (teaching.related_categories.length) {
            lines.push(
                `相关内容：${teaching.related_categories.join("、")}`
            );
        }

        lines.push(
            `提问方式：${getFriendlyInputSource(teaching.input_source)}`
        );
    }

    info.innerText = lines.join("\n");
}


// -----------------------------
// 全刷新
// -----------------------------
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}


// -----------------------------
// 初始化
// -----------------------------
document.addEventListener(
    "DOMContentLoaded",
    () => {
        const input = document.getElementById("text");
        const imageBtn = document.getElementById("imageBtn");
        const imageInput = document.getElementById("imageInput");

        if (input) {
            input.addEventListener(
                "keydown",
                event => {
                    if (
                        event.key === "Enter"
                        && !event.shiftKey
                    ) {
                        event.preventDefault();
                        send();
                    }
                }
            );
        }

        if (imageBtn) {
            imageBtn.addEventListener(
                "click",
                openImagePicker
            );
        }

        if (imageInput) {
            imageInput.addEventListener(
                "change",
                handleImageSelected
            );
        }

        const restored = loadState();

        if (!restored) {
            const id = makeSessionId();

            sessions.push({
                id,
                name: "新对话",
                messages: [],
                teaching: null
            });

            currentId = id;
            saveState();
        }

        renderAll();
        enableInput(true);
    }
);
