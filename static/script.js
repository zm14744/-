let sessions = [];
let currentId = null;

// 新对话
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

// 当前会话
function getCurrent() {
    return sessions.find(s => s.id === currentId);
}

// 发送
function send() {

    const input = document.getElementById("text");
    const text = input.value.trim();
    input.value = "";

    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();

    s.messages.push({ role: "user", text });
    renderChat();

    // AI占位
    const aiMsg = { role: "ai", text: "" };
    s.messages.push(aiMsg);
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

        const fullText = res.reply;

        typeWriter(fullText, aiMsg, () => {
            renderInfo();
        });
    });
}

// ⭐ 打字机效果（核心）
function typeWriter(text, msgObj, callback) {

    let i = 0;
    msgObj.text = "";

    function step() {

        if (i < text.length) {
            msgObj.text += text[i];
            i++;

            renderChat();

            setTimeout(step, 20); // 控制速度
        } else {
            callback && callback();
        }
    }

    step();
}

// 回车
document.getElementById("text").addEventListener("keydown", function(e){
    if (e.key === "Enter") {
        e.preventDefault();
        send();
    }
});

// 渲染聊天
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

    // ⭐ 关键：MathJax重新渲染（不破坏你原功能）
    if (window.MathJax) {
        MathJax.typesetPromise();
    }
}

// 会话列表
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

        const del = document.createElement("button");
        del.className = "del";
        del.onclick = (e) => {
            e.stopPropagation();
            sessions = sessions.filter(x => x.id !== s.id);
            if (currentId === s.id) currentId = null;
            renderAll();
        };

        div.appendChild(del);
        box.appendChild(div);
    });
}

// 信息栏
function renderInfo() {
    const s = getCurrent();
    if (!s) return;

    document.getElementById("info").innerText =
        "名称: " + s.name + "\n消息数: " + s.messages.length;
}

// 总渲染
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

newChat();
