// ========== 配置 ==========
marked.setOptions({ gfm: true, breaks: true, sanitize: false });

function ensureMathDelimiters(text) {
    if (!text || typeof text !== 'string') return text;
    if (/\$/.test(text)) return text;
    const hasLatex = /\\[a-zA-Z]|\\begin|\\end/.test(text);
    if (!hasLatex) return text;
    return text.includes('\n') ? '$$' + text + '$$' : '$' + text + '$';
}

// ========== 状态 ==========
let sessions = [];
let currentId = null;
let typingTimer = null;
let typingDiv = null;
let typingFullText = "";
let typingCurrentText = "";
let typingSessionId = null;
const TYPING_SPEED = 15;

// ========== 辅助函数 ==========
function getCurrent() { return sessions.find(s => s.id === currentId); }

function enableInput(enable) {
    const input = document.getElementById("text");
    const btn = document.getElementById("sendBtn");
    if (input) {
        input.disabled = !enable;
        if (enable) input.focus();
        console.log('输入框 disabled =', input.disabled);
    }
    if (btn) btn.disabled = !enable;
    console.log('enableInput 被调用，enable =', enable);
}

// ========== 核心功能 ==========
function newChat() {
    if (typingTimer) forceCompleteTyping();
    const id = Date.now();
    sessions.push({ id, name: "新对话", messages: [] });
    currentId = id;
    renderAll();
    enableInput(true);
}

async function send() {
    console.log('send 被调用, typingTimer =', typingTimer);
    if (typingTimer) return; // 打字中不允许发送

    const input = document.getElementById("text");
    if (!input) { console.error('input 元素不存在'); return; }
    const text = input.value.trim();
    if (!text) return;

    if (!currentId) newChat();
    const s = getCurrent();
    s.messages.push({ role: "user", text });
    renderChat();
    renderInfo();
    input.value = "";

    // 禁用输入，等待回复
    enableInput(false);

    try {
        const response = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        const data = await response.json();
        const reply = data.reply || "（未收到回复）";
        await startTyping(reply, s);
    } catch (err) {
        console.error('请求失败:', err);
        // 即使出错也以错误消息启动打字，最终启用输入
        await startTyping("❌ 请求失败: " + err.message, s);
    } finally {
        // 确保无论如何都会启用输入（但 startTyping 内部也会启用，这里作为兜底）
        // 但为避免过早启用，如果 startTyping 已经启用，重复启用也无妨
        // 不过因为 startTyping 是异步的，我们在这里加一个延迟确保它完成？
        // 实际上 startTyping 内部会调用 enableInput(true)，我们不再重复。
        // 但为了防止 startTyping 异常，我们在这里也尝试启用
        // 使用 setTimeout 让 startTyping 先执行
        setTimeout(() => {
            // 如果输入仍然禁用，强制启用
            const input = document.getElementById("text");
            if (input && input.disabled) {
                console.warn('兜底启用输入');
                enableInput(true);
            }
        }, 100);
    }
}

function startTyping(text, session) {
    return new Promise((resolve) => {
        console.log('startTyping 开始, 文本长度:', text.length);
        // 如果已有打字，强制完成
        if (typingTimer) forceCompleteTyping();

        typingFullText = text || "";
        typingCurrentText = "";
        typingSessionId = session.id;
        const chat = document.getElementById("chat");
        if (!chat) {
            console.error('chat 元素不存在');
            enableInput(true);
            resolve();
            return;
        }

        // 创建临时消息
        const div = document.createElement("div");
        div.className = "msg ai";
        chat.appendChild(div);
        typingDiv = div;

        // 如果文本为空，直接完成
        if (typingFullText.length === 0) {
            finishTyping();
            resolve();
            return;
        }

        // 启动打字定时器
        typingTimer = setInterval(() => {
            if (typingCurrentText.length < typingFullText.length) {
                typingCurrentText += typingFullText[typingCurrentText.length];
                typingDiv.innerText = typingCurrentText;
                chat.scrollTop = chat.scrollHeight;
            } else {
                clearInterval(typingTimer);
                typingTimer = null;
                finishTyping();
                resolve();
            }
        }, TYPING_SPEED);

        function finishTyping() {
            try {
                let processed = typingFullText;
                if (!/\$/.test(processed)) {
                    processed = ensureMathDelimiters(processed);
                }
                typingDiv.innerHTML = marked.parse(processed);
            } catch (e) {
                console.error('渲染 Markdown 失败:', e);
                typingDiv.innerText = typingFullText;
            }
            // 保存消息
            const s = sessions.find(s => s.id === typingSessionId);
            if (s) {
                s.messages.push({ role: "ai", text: typingFullText });
            }
            typingDiv = null;
            typingSessionId = null;
            // 刷新界面并启用输入
            renderChat();
            renderInfo();
            enableInput(true);
        }
    });
}

function forceCompleteTyping() {
    if (!typingTimer) return;
    clearInterval(typingTimer);
    typingTimer = null;
    if (typingDiv) {
        try {
            let processed = typingFullText;
            if (!/\$/.test(processed)) {
                processed = ensureMathDelimiters(processed);
            }
            typingDiv.innerHTML = marked.parse(processed);
        } catch (e) {
            typingDiv.innerText = typingFullText;
        }
        const s = sessions.find(s => s.id === typingSessionId);
        if (s) {
            s.messages.push({ role: "ai", text: typingFullText });
        }
        typingDiv = null;
        typingSessionId = null;
        renderChat();
        renderInfo();
        enableInput(true);
    }
}

// ========== 渲染函数 ==========
function renderChat() {
    const chat = document.getElementById("chat");
    if (!chat) return;
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
            let content = m.text;
            if (!/\$/.test(content)) {
                content = ensureMathDelimiters(content);
            }
            try {
                div.innerHTML = marked.parse(content);
            } catch {
                div.innerText = m.text;
            }
        }
        chat.appendChild(div);
    });

    if (typingTimer && typingDiv && typingSessionId === currentId) {
        const newDiv = document.createElement("div");
        newDiv.className = "msg ai";
        newDiv.innerText = typingCurrentText;
        chat.appendChild(newDiv);
        typingDiv = newDiv;
    }

    if (window.MathJax) {
        MathJax.typesetPromise([chat]).catch(err => console.warn('MathJax error:', err));
    }
    chat.scrollTop = chat.scrollHeight;
}

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
            renderChat();
            renderInfo();
            enableInput(true);
        };
        span.ondblclick = () => {
            if (typingTimer) forceCompleteTyping();
            const newName = prompt("修改名称：", s.name);
            if (newName) { s.name = newName; renderSessions(); }
        };

        const del = document.createElement("button");
        del.className = "del";
        del.title = "删除对话";
        del.onclick = (e) => {
            e.stopPropagation();
            if (typingTimer) forceCompleteTyping();
            deleteSession(s.id);
        };

        div.appendChild(span);
        div.appendChild(del);
        box.appendChild(div);
    });
}

function deleteSession(id) {
    sessions = sessions.filter(s => s.id !== id);
    if (!sessions.some(s => s.id === currentId)) {
        currentId = sessions.length > 0 ? sessions[0].id : null;
    }
    renderAll();
    if (sessions.length === 0) {
        enableInput(false);
        const input = document.getElementById("text");
        if (input) input.placeholder = "请新建对话";
    } else {
        enableInput(true);
    }
}

function renderInfo() {
    const info = document.getElementById("info");
    if (!info) return;
    const s = getCurrent();
    info.innerText = s ? `名称: ${s.name}\n消息数: ${s.messages.length}` : "无会话";
}

function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

// ========== 初始化 ==========
document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("text");
    if (input) {
        input.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey && !input.disabled) {
                e.preventDefault();
                send();
            }
        });
    }
    newChat();
});
