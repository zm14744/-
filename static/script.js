const chat = document.getElementById("chat");
const input = document.getElementById("input");

let messages = [];

// 打字机状态
let typingTimer = null;
let typingText = "";
let typingIndex = 0;
let typingDiv = null;

const SPEED = 20;

// 发送
async function send() {
    const text = input.value.trim();
    if (!text) return;

    input.value = "";

    addMessage("user", text);
    messages.push({ role: "user", content: text });

    const res = await fetch("/chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ messages })
    });

    const data = await res.json();
    const reply = data.reply;

    messages.push({ role: "assistant", content: reply });

    typeWriter(reply);
}

// 用户消息
function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.innerText = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

// ✅ 打字机（不改效果，只修稳定性）
function typeWriter(text) {

    typingText = text;
    typingIndex = 0;

    typingDiv = document.createElement("div");
    typingDiv.className = "msg bot";
    chat.appendChild(typingDiv);

    clearInterval(typingTimer);

    typingTimer = setInterval(() => {

        typingIndex++;

        const current = typingText.slice(0, typingIndex);

        // ✅ 关键修复：防止 markdown / 数学炸
        try {
            typingDiv.innerHTML = marked.parse(current);
        } catch {
            typingDiv.innerText = current;
        }

        chat.scrollTop = chat.scrollHeight;

        // 完成
        if (typingIndex >= typingText.length) {
            clearInterval(typingTimer);
            typingTimer = null;

            // ✅ 只在结束后 MathJax
            if (window.MathJax) {
                MathJax.typesetPromise([typingDiv]).catch(()=>{});
            }
        }

    }, SPEED);
}
