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
                messages
            });
        }

        if (!loadedSessions.length) {
            return false;
        }

        sessions = loadedSessions;

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
function markdownToHtml(text) {
    const rawHtml = marked.parse(text || "");

    // 下一步 index.html 会引入 DOMPurify。
    // 在 DOMPurify 存在时自动启用净化。
    if (window.DOMPurify) {
        return DOMPurify.sanitize(rawHtml);
    }

    return rawHtml;
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
        messages: []
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

        const text = typeof data.text === "string"
            ? data.text.trim()
            : "";

        if (!text) {
            showAssistantMessage(
                session,
                "没有识别到有效的题目内容，请重新拍摄或裁剪图片。",
                { isError: true }
            );
            return;
        }

        session.messages.push({
            role: "user",
            text,
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

            if (!sessions.length) {
                const id = makeSessionId();

                sessions.push({
                    id,
                    name: "新对话",
                    messages: []
                });

                currentId = id;
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

    info.innerText = session
        ? `名称: ${session.name}\n消息数: ${session.messages.length}`
        : "无会话";
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

        const restored = loadState();

        if (!restored) {
            const id = makeSessionId();

            sessions.push({
                id,
                name: "新对话",
                messages: []
            });

            currentId = id;
            saveState();
        }

        renderAll();
        enableInput(true);
    }
);
