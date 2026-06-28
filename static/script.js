let sessions = [];
let currentId = null;

// ===== 新对话 =====
function newChat() {
    const id = Date.now();
    sessions.push({
        id,
        name: "新对话",
        messages: []
    });
    currentId = id;
    renderAll();
}

// ===== 当前会话 =====
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

// ===== 发送消息 =====
function send() {
    const input = document.getElementById("text");
    const text = input.value.trim();
    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();
    s.messages.push({ role: "user", text });
    renderChat();

    input.value = "";

    fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
    })
    .then(r => r.json())
    .then(res => {
        const reply = res.reply;
        typeWriter(reply, (finalText) => {
            s.messages.push({ role: "ai", text: finalText });
            renderChat();
            renderInfo();
        });
    });
}

// ===== 打字机效果 + 最终 Markdown 渲染 =====
function typeWriter(text, callback) {
    const chat = document.getElementById("chat");
    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);

    let i = 0;
    let output = "";
    function step() {
        if (i < text.length) {
            output += text[i];
            div.innerText = output; // 打字过程显示纯文本
            i++;
            setTimeout(step, 15);
        } else {
            // 打字结束，渲染为 Markdown
            const renderedHtml = marked.parse(text);
            div.innerHTML = renderedHtml;
            if (window.MathJax) {
                MathJax.typesetPromise([div]);
            }
            callback(output);
        }
    }
    step();
}

// ===== 渲染聊天内容 =====
function renderChat() {
    const chat = document.getElementById("chat");
    chat.innerHTML = "";
    const s = getCurrent();
    if (!s) return;

    s.messages.forEach(m => {
        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");
        if (m.role === "user") {
            div.innerText = m.text;
        } else {
            // AI 消息直接渲染为 Markdown（已存储的最终文本）
            div.innerHTML = marked.parse(m.text);
        }
        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;

    if (window.MathJax) {
        MathJax.typesetPromise();
    }
}

// ===== 渲染会话列表（含删除按钮） =====
function renderSessions() {
    const box = document.getElementById("sessions");
    box.innerHTML = "";

    sessions.forEach(s => {
        const div = document.createElement("div");
        div.className = "session";

        const nameSpan = document.createElement("span");
        nameSpan.innerText = s.name;
        nameSpan.onclick = () => {
            currentId = s.id;
            renderChat();
            renderInfo();
        };
        nameSpan.ondblclick = () => {
            const newName = prompt("修改名称：", s.name);
            if (newName) {
                s.name = newName;
                renderSessions();
            }
        };

        const delBtn = document.createElement("button");
        delBtn.className = "del";
        delBtn.innerText = "✕";
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteSession(s.id);
        };

        div.appendChild(nameSpan);
        div.appendChild(delBtn);
        box.appendChild(div);
    });
}

// ===== 删除会话 =====
function deleteSession(id) {
    sessions = sessions.filter(s => s.id !== id);
    if (!sessions.some(s => s.id === currentId)) {
        if (sessions.length > 0) {
            currentId = sessions[0].id;
        } else {
            newChat();
            return;
        }
    }
    renderAll();
}

// ===== 右侧信息 =====
function renderInfo() {
    const s = getCurrent();
    if (!s) return;
    document.getElementById("info").innerText =
        "名称: " + s.name + "\n消息数: " + s.messages.length;
}

// ===== 全刷新 =====
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

// ===== 绑定 Enter 键 =====
document.addEventListener("DOMContentLoaded", function() {
    const input = document.getElementById("text");
    if (input) {
        input.addEventListener("keydown", function(e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });
    }
});

// ===== 初始化 =====
newChat();
