marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
});

// ================= 状态（不动） =================
let sessions = [];
let currentId = null;

let typingTimer = null;
let typingDiv = null;
let typingFullText = "";
let typingSessionId = null;

const TYPING_SPEED = 15;

// ================= 工具（不动） =================
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

function enableInput(enable) {
    const input = document.getElementById("text");
    const btn = document.getElementById("sendBtn");

    if (input) {
        input.disabled = !enable;
        input.placeholder = enable ? "输入消息…" : "等待回复…";
        if (enable) input.focus();
    }
    if (btn) btn.disabled = !enable;
}

// ================= 只做轻清理（不动LaTeX） =================
function cleanText(text) {
    return text.replace(/\b(INLINE|BLOCK)\b/gi, '').trim();
}

// ================= ⭐ 渲染核心（修复排版） =================
function renderContent(text) {
    return `<div class="ai-content">${marked.parse(cleanText(text))}</div>`;
}

// ================= 新建对话（不动） =================
function newChat() {
    if (typingTimer) forceCompleteTyping();

    const id = Date.now();
    sessions.push({ id, name: "新对话", messages: [] });
    currentId = id;

    renderAll();
    enableInput(true);
}

// ================= 发送（修复 fetch 稳定性） =================
function send() {
    if (typingTimer) return;

    const input = document.getElementById("text");
    const text = input.value.trim();
    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();
    if (!s) return;

    s.messages.push({ role: "user", text });

    renderChat();
    renderInfo();

    input.value = "";

    enableInput(false);

    fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            messages: s.messages.map(m => ({
                role: m.role === "user" ? "user" : "assistant",
                content: m.text
            }))
        })
    })
    .then(async res => {
        const t = await res.text();
        try {
            const data = JSON.parse(t);
            startTyping(data.reply || "（未收到回复）", s);
        } catch (e) {
            console.error("后端错误：", t);
            startTyping("❌ 后端返回异常", s);
        }
    })
    .catch(err => {
        startTyping("❌ 请求失败: " + err.message, s);
    });
}

// ================= 打字（不动结构） =================
function startTyping(text, session) {
    if (typingTimer) forceCompleteTyping();

    typingFullText = text || "";
    typingSessionId = session.id;

    const chat = document.getElementById("chat");
    if (!chat) return;

    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);
    typingDiv = div;

    let i = 0;

    typingTimer = setInterval(() => {
        if (i < typingFullText.length) {
            typingDiv.innerText += typingFullText[i++];
        } else {
            clearInterval(typingTimer);
            typingTimer = null;
            finish();
        }
    }, TYPING_SPEED);

    function finish() {
        typingDiv.innerHTML = renderContent(typingFullText);

        const s = sessions.find(x => x.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingFullText });

        typingDiv = null;
        typingSessionId = null;

        renderChat();
        renderInfo();
        enableInput(true);

        if (window.MathJax) {
            MathJax.typesetPromise();
        }
    }
}

// ================= 强制结束 typing =================
function forceCompleteTyping() {
    if (!typingTimer) return;

    clearInterval(typingTimer);
    typingTimer = null;

    if (typingDiv) {
        typingDiv.innerHTML = renderContent(typingFullText);

        const s = sessions.find(x => x.id === typingSessionId);
        if (s) s.messages.push({ role: "ai", text: typingFullText });

        typingDiv = null;
        typingSessionId = null;

        renderChat();
        renderInfo();
        enableInput(true);

        if (window.MathJax) MathJax.typesetPromise();
    }
}

// ================= 渲染聊天（⭐关键修复：可复制+排版） =================
function renderChat() {
    const chat = document.getElementById("chat");
    chat.innerHTML = "";

    const s = getCurrent();
    if (!s) {
        chat.innerHTML = '<div class="empty-tip">暂无对话，请新建</div>';
        return;
    }

    s.messages.forEach(m => {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");

        if (m.role === "user") {
            div.innerText = m.text;
        } else {
            div.innerHTML = renderContent(m.text);
        }

        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;

    if (window.MathJax) {
        MathJax.typesetPromise([chat]);
    }
}

// ================= 左侧删除（❗完全不动你原逻辑） =================
// 👉 这一段我不改，你原来 script 里的 renderSessions 保留即可

function renderSessions() {
    const box = document.getElementById("sessions");
    if (!box) return;

    box.innerHTML = "";

    sessions.forEach(s => {
        const div = document.createElement("div");
        div.className = "session";

        const span = document.createElement("span");
        span.innerText = s.name;

        span.onclick = () => {
            if (typingTimer) forceCompleteTyping();
            currentId = s.id;
            renderAll();
            enableInput(true);
        };

        span.ondblclick = () => {
            const newName = prompt("修改名称：", s.name);
            if (newName) {
                s.name = newName;
                renderSessions();
            }
        };

        const del = document.createElement("button");
        del.className = "del";
        del.onclick = (e) => {
            e.stopPropagation();
            sessions = sessions.filter(x => x.id !== s.id);
            renderAll();
        };

        div.appendChild(span);
        div.appendChild(del);
        box.appendChild(div);
    });
}

// ================= info =================
function renderInfo() {
    const info = document.getElementById("info");
    const s = getCurrent();

    info.innerText = s
        ? `名称: ${s.name}\n消息数: ${s.messages.length}`
        : "无会话";
}

// ================= 初始化 =================
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("text");

    input.addEventListener("keydown", e => {
        if (e.key === "Enter") send();
    });

    newChat();
    enableInput(true);
});
