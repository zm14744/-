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

// ===== 发送 =====
function send() {

    const input = document.getElementById("text");
    const text = input.value.trim();
    input.value = "";

    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();

    s.messages.push({ role: "user", text });

    renderChat();

    fetch("/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
    })
    .then(r => r.json())
    .then(res => {

        const reply = res.reply;

        // ===== 打字机效果核心 =====
        typeWriter(reply, (finalText) => {

            s.messages.push({ role: "ai", text: finalText });

            renderChat();
            renderInfo();
        });
    });
}

// ===== 打字机效果 =====
function typeWriter(text, callback) {

    const s = getCurrent();
    const chat = document.getElementById("chat");

    const div = document.createElement("div");
    div.className = "msg ai";
    chat.appendChild(div);

    let i = 0;
    let output = "";

    function step() {

        if (i < text.length) {

            output += text[i];
            div.innerText = output;

            i++;
            setTimeout(step, 15); // 速度控制
        } else {
            callback(output);
        }
    }

    step();
}

// ===== 渲染聊天 =====
function renderChat() {

    const chat = document.getElementById("chat");
    chat.innerHTML = "";

    const s = getCurrent();
    if (!s) return;

    s.messages.forEach(m => {

        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "user" : "ai");

        div.innerText = m.text;
        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;

    // ⭐ MathJax刷新（你原来的功能保留）
    if (window.MathJax) {
        MathJax.typesetPromise();
    }
}

// ===== 会话列表 =====
function renderSessions() {

    const box = document.getElementById("sessions");
    box.innerHTML = "";

    sessions.forEach(s => {

        const div = document.createElement("div");
        div.className = "session";
        div.innerText = s.name;

        div.onclick = () => {
            currentId = s.id;
            renderChat();
            renderInfo();
        };

        div.ondblclick = () => {
            const name = prompt("修改名称：", s.name);
            if (name) {
                s.name = name;
                renderSessions();
            }
        };

        box.appendChild(div);
    });
}

// ===== 信息 =====
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

// 初始化
newChat();
