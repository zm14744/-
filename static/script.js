let sessions = [];
let currentId = null;

// 新对话（默认名）
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

// 发送（回车修复）
function send() {

    const input = document.getElementById("text");
    const text = input.value.trim();
    input.value = "";

    if (!text) return;

    if (!currentId) newChat();

    const s = getCurrent();

    s.messages.push({ role: "user", text });

    renderChat();

    fetch("/chat_stream?text=" + encodeURIComponent(text))
        .then(r => r.text())
        .then(res => {

            s.messages.push({ role: "ai", text: res });

            renderChat();
            renderInfo();
        });
}

// 回车只在输入框触发
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
}

// 渲染会话列表（双击改名）
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

        // 双击改名
        div.ondblclick = () => {
            const name = prompt("修改名称：", s.name);
            if (name) {
                s.name = name;
                renderSessions();
            }
        };

        // 删除
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

// OCR（优化体验，不自动触发）
/*function ocr() {

    const file = document.getElementById("img").files[0];
    if (!file) return;

    document.getElementById("ocrResult").innerText = "识别中...";

    const form = new FormData();
    form.append("file", file);

    fetch("/ocr", {
        method: "POST",
        body: form
    })
    .then(r => r.json())
    .then(d => {
        document.getElementById("ocrResult").innerText = d.text || "无结果";
    });
}*/

// 显示文件名
function showFileName() {
    const file = document.getElementById("img").files[0];
    if (file) {
        document.getElementById("fileName").innerText = file.name;
    }
}

// 信息
function renderInfo() {
    const s = getCurrent();
    if (!s) return;
    document.getElementById("info").innerText =
        "名称: " + s.name + "\n消息数: " + s.messages.length;
}

// 初始化
function renderAll() {
    renderSessions();
    renderChat();
    renderInfo();
}

newChat();
