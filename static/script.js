let sessions = [];
let currentId = null;

// =======================
// 打字机
// =======================
function typeWriter(el, text, speed = 10) {
    let i = 0;
    el.innerText = "";

    function run() {
        if (i < text.length) {
            el.innerText += text[i];
            i++;
            setTimeout(run, speed);
        }
    }

    run();
}

// =======================
// 本地存储
// =======================
function saveSessions() {
    localStorage.setItem("sessions", JSON.stringify(sessions));
}

// =======================
// 初始化加载
// =======================
function loadSessions() {
    const data = localStorage.getItem("sessions");

    if (data) {
        sessions = JSON.parse(data);
        currentId = sessions[0]?.id || null;
    } else {
        newChat();
    }
}

// =======================
// 新对话
// =======================
function newChat() {
    const id = Date.now();

    sessions.push({
        id,
        name: "新对话",
        messages: []
    });

    currentId = id;
    saveSessions();
    renderAll();
}

// =======================
// 当前会话
// =======================
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

// =======================
// 发送消息
// =======================
function send() {

    const input = document.getElementById("text");
    const text = input.value.trim();
    input.value = "";

    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();

    // 用户消息
    s.messages.push({ role: "user", text });
    saveSessions();

    renderChat();

    fetch("/chat_stream?text=" + encodeURIComponent(text))
        .then(r => r.text())
        .then(res => {

            s.messages.push({
                role: "ai",
                text: res,
                typed: false
            });

            saveSessions();

            renderChat();
            renderInfo();
        });
}

// =======================
// 回车发送
// =======================
document.getElementById("text").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
        e.preventDefault();
        send();
    }
});

// =======================
// 渲染聊天
// =======================
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

            if (!m.typed) {
                typeWriter(div, m.text);
                m.typed = true;
            } else {
                div.innerText = m.text;
            }
        }

        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;

    // ⭐MathJax
    if (window.MathJax) {
        MathJax.typeset();
    }
}

// =======================
// 会话列表
// =======================
function renderSessions() {

    const box = document.getElementById("sessions");
    box.innerHTML = "";

    sessions.forEach(s => {

        const div = document.createElement("div");
        div.className = "session";
        div.innerText = s.name;

        // 选中会话
        div.onclick = () => {
            currentId = s.id;
            renderChat();
            renderInfo();
        };

        // 重命名
        div.ondblclick = () => {
            const name = prompt("修改名称：", s.name);
            if (!name) return;

            s.name = name;
            saveSessions();
            renderSessions();
        };

        // 删除
        const del = document.createElement("button");
        del.className = "del";

        del.onclick = (e) => {
            e.stopPropagation();

            sessions = sessions.filter(x => x.id !== s.id);

            if (currentId === s.id) currentId = null;

            saveSessions();
            renderAll();
        };

        div.appendChild(del);
        box.appendChild(div);
    });
}

// =======================
// 信息栏
// =======================
function renderInfo() {
    const s = getCurrent();
    if (!s) return;

    document.getElementById("info").innerText =
        "名称: " + s.name + "\n消息数: " + s.messages.length;
}

// =======================
// 全局刷新
// =======================
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

// =======================
// 启动
// =======================
loadSessions();
renderAll();
