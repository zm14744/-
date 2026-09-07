marked.setOptions({
    gfm: true,
    breaks: true
});

const STORAGE_KEY = "discrete_math_ai_sessions_v1";
const LEARNING_STORAGE_KEY = "discrete_math_ai_learning_v1";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_WRONG_QUESTIONS = 80;

let wrongBookFilter = "all";
let wrongBookSearch = "";
let wrongBookSort = "recent";
let currentWrongEditId = null;

const EMBEDDED_KNOWLEDGE_GRAPH = {"version":1,"title":"离散数学知识脉络","description":"用于教学提示、前置知识提醒和后续学习状态记录的轻量知识图谱。当前版本只描述知识结构，不记录学生掌握度。","nodes":[{"id":"logic_truth","name":"命题与真值","category":"命题逻辑","prerequisites":[]},{"id":"logic_connectives","name":"逻辑联结词","category":"命题逻辑","prerequisites":["命题与真值"]},{"id":"logic_truth_table","name":"真值表","category":"命题逻辑","prerequisites":["逻辑联结词"]},{"id":"logic_equivalence","name":"逻辑等价","category":"命题逻辑","prerequisites":["真值表"]},{"id":"logic_normal_form","name":"范式","category":"命题逻辑","prerequisites":["逻辑等价"]},{"id":"logic_reasoning","name":"命题推理","category":"命题逻辑","prerequisites":["逻辑联结词","逻辑等价"]},{"id":"predicate_domain","name":"谓词与个体域","category":"谓词逻辑","prerequisites":["命题与真值"]},{"id":"predicate_quantifier","name":"量词","category":"谓词逻辑","prerequisites":["谓词与个体域"]},{"id":"predicate_variable","name":"变元与辖域","category":"谓词逻辑","prerequisites":["量词"]},{"id":"predicate_reasoning","name":"量词推理与否定","category":"谓词逻辑","prerequisites":["量词","变元与辖域"]},{"id":"set_operation","name":"集合运算","category":"集合与关系","prerequisites":[]},{"id":"relation_cartesian","name":"笛卡尔积与关系","category":"集合与关系","prerequisites":["集合运算"]},{"id":"relation_property","name":"关系性质","category":"集合与关系","prerequisites":["笛卡尔积与关系"]},{"id":"relation_equivalence","name":"等价关系与划分","category":"集合与关系","prerequisites":["关系性质"]},{"id":"relation_order","name":"偏序关系","category":"集合与关系","prerequisites":["关系性质"]},{"id":"relation_closure","name":"关系闭包","category":"集合与关系","prerequisites":["关系性质"]},{"id":"function_mapping","name":"函数与映射","category":"函数","prerequisites":["集合运算"]},{"id":"function_injection","name":"单射满射双射","category":"函数","prerequisites":["函数与映射"]},{"id":"function_composition","name":"复合函数","category":"函数","prerequisites":["函数与映射"]},{"id":"function_inverse","name":"逆函数","category":"函数","prerequisites":["单射满射双射","复合函数"]},{"id":"count_basic","name":"基本计数原理","category":"计数与组合","prerequisites":[]},{"id":"count_perm_comb","name":"排列与组合","category":"计数与组合","prerequisites":["基本计数原理"]},{"id":"count_binomial","name":"二项式定理","category":"计数与组合","prerequisites":["排列与组合"]},{"id":"count_pigeonhole","name":"鸽巢原理","category":"计数与组合","prerequisites":["基本计数原理"]},{"id":"count_inclusion","name":"容斥原理","category":"计数与组合","prerequisites":["基本计数原理","集合运算"]},{"id":"count_generating","name":"生成函数","category":"计数与组合","prerequisites":["排列与组合"]},{"id":"recurrence_model","name":"递推关系建模","category":"递推关系","prerequisites":["基本计数原理"]},{"id":"recurrence_homogeneous","name":"线性齐次递推","category":"递推关系","prerequisites":["递推关系建模"]},{"id":"recurrence_nonhomogeneous","name":"非齐次递推","category":"递推关系","prerequisites":["线性齐次递推"]},{"id":"recurrence_initial","name":"初始条件","category":"递推关系","prerequisites":["递推关系建模"]},{"id":"graph_basic","name":"图的基本概念","category":"图论","prerequisites":[]},{"id":"graph_adjacency","name":"邻接矩阵","category":"图论","prerequisites":["图的基本概念"]},{"id":"graph_matrix","name":"图的矩阵表示","category":"图论","prerequisites":["图的基本概念","邻接矩阵"]},{"id":"graph_connectivity","name":"路径与连通性","category":"图论","prerequisites":["图的基本概念"]},{"id":"graph_euler","name":"欧拉图","category":"图论","prerequisites":["路径与连通性"]},{"id":"graph_hamilton","name":"哈密顿图","category":"图论","prerequisites":["路径与连通性"]},{"id":"graph_shortest","name":"最短路","category":"图论","prerequisites":["路径与连通性"]},{"id":"graph_coloring","name":"图着色","category":"图论","prerequisites":["图的基本概念"]},{"id":"graph_planar","name":"平面图","category":"图论","prerequisites":["图的基本概念"]},{"id":"graph_matching","name":"图匹配","category":"图论","prerequisites":["图的基本概念"]},{"id":"tree_basic","name":"树的基本性质","category":"图论","prerequisites":["图的基本概念","路径与连通性"]},{"id":"tree_spanning","name":"生成树","category":"图论","prerequisites":["树的基本性质","路径与连通性"]},{"id":"tree_mst","name":"最小生成树","category":"图论","prerequisites":["生成树"]},{"id":"tree_matrix_tree","name":"矩阵树定理","category":"图论","prerequisites":["图的矩阵表示","生成树"]},{"id":"algebra_system","name":"代数系统","category":"代数结构","prerequisites":["函数与映射"]},{"id":"algebra_group","name":"群与子群","category":"代数结构","prerequisites":["代数系统"]},{"id":"algebra_homomorphism","name":"同态与同构","category":"代数结构","prerequisites":["群与子群","函数与映射"]},{"id":"algebra_ring_field","name":"环与域","category":"代数结构","prerequisites":["群与子群"]},{"id":"algebra_lattice_bool","name":"格与布尔代数","category":"代数结构","prerequisites":["偏序关系"]}]};

let knowledgeGraphData = null;
let knowledgeGraphFilter = "全部";
let knowledgeGraphSelectedNodeId = "";
let knowledgeGraphLoading = false;

let sessions = [];
let currentId = null;
let learningState = createEmptyLearningState();

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
        focus_points: asTextList(value.focus_points).slice(0, 2),
        prerequisite_points: asTextList(value.prerequisite_points),
        knowledge_path: asTextList(value.knowledge_path),
        question_type: asText(value.question_type) || "综合题",
        mode: asText(value.mode) || "hint",
        mode_label: asText(value.mode_label) || "提示引导",
        confidence: asText(value.confidence) || "低",
        input_source: asText(value.input_source) || "文本输入"
    };
}


function normalizeRetestSession(value) {
    if (!value || typeof value !== "object") {
        return null;
    }

    const stage = [
        "generating",
        "awaiting_answer",
        "checking",
        "finished"
    ].includes(value.stage)
        ? value.stage
        : "finished";

    return {
        wrongQuestionId: typeof value.wrongQuestionId === "string"
            ? value.wrongQuestionId
            : "",
        stage,
        targetPoints: Array.isArray(value.targetPoints)
            ? value.targetPoints
                .filter(item => typeof item === "string" && item.trim())
                .map(item => item.trim())
                .slice(0, 2)
            : [],
        generatedQuestion: typeof value.generatedQuestion === "string"
            ? value.generatedQuestion.trim().slice(0, 3000)
            : "",
        startedAt: Number.isFinite(value.startedAt)
            ? value.startedAt
            : Date.now(),
        result: ["correct", "wrong", "unknown"].includes(value.result)
            ? value.result
            : ""
    };
}


function createEmptyLearningState() {
    return {
        version: 3,
        knowledge: {},
        wrongQuestions: []
    };
}

function normalizeLearningQuestion(value) {
    if (!value || typeof value !== "object") {
        return null;
    }

    const text = typeof value.text === "string"
        ? value.text.trim()
        : "";

    if (!text) {
        return null;
    }

    const knowledgePoints = Array.isArray(value.knowledgePoints)
        ? value.knowledgePoints
            .filter(item => typeof item === "string" && item.trim())
            .map(item => item.trim())
            .slice(0, 4)
        : [];

    const focusPoints = Array.isArray(value.focusPoints)
        ? value.focusPoints
            .filter(item => typeof item === "string" && item.trim())
            .map(item => item.trim())
            .slice(0, 2)
        : [];

    return {
        text: text.slice(0, 3000),
        knowledgePoints,
        focusPoints,
        category: typeof value.category === "string"
            ? value.category.trim()
            : "",
        source: value.source === "ocr" ? "ocr" : "text",
        sessionId: (
            typeof value.sessionId === "number"
            || typeof value.sessionId === "string"
        )
            ? value.sessionId
            : null,
        updatedAt: Number.isFinite(value.updatedAt)
            ? value.updatedAt
            : Date.now()
    };
}

function normalizeLearningState(value) {
    const state = createEmptyLearningState();

    if (!value || typeof value !== "object") {
        return state;
    }

    if (value.knowledge && typeof value.knowledge === "object") {
        for (const [name, raw] of Object.entries(value.knowledge)) {
            if (
                typeof name !== "string"
                || !name.trim()
                || !raw
                || typeof raw !== "object"
            ) {
                continue;
            }

            state.knowledge[name.trim()] = {
                seen: Math.max(0, Number(raw.seen) || 0),
                correct: Math.max(0, Number(raw.correct) || 0),
                wrong: Math.max(0, Number(raw.wrong) || 0),
                support: Math.max(0, Number(raw.support) || 0),
                reviewed: Math.max(0, Number(raw.reviewed) || 0),
                updatedAt: Number.isFinite(raw.updatedAt)
                    ? raw.updatedAt
                    : Date.now()
            };
        }
    }

    if (Array.isArray(value.wrongQuestions)) {
        const normalizedWrong = value.wrongQuestions
            .filter(item => item && typeof item === "object")
            .map(item => {
                const question = typeof item.question === "string"
                    ? item.question.trim()
                    : "";

                if (!question) return null;

                return {
                    id: typeof item.id === "string" && item.id
                        ? item.id
                        : `wrong-${Date.now()}-${Math.random()}`,
                    question: question.slice(0, 3000),
                    knowledgePoints: Array.isArray(item.knowledgePoints)
                        ? item.knowledgePoints
                            .filter(point => typeof point === "string" && point.trim())
                            .map(point => point.trim())
                            .slice(0, 4)
                        : [],
                    focusPoints: Array.isArray(item.focusPoints)
                        ? item.focusPoints
                            .filter(point => typeof point === "string" && point.trim())
                            .map(point => point.trim())
                            .slice(0, 2)
                        : [],
                    category: typeof item.category === "string"
                        ? item.category.trim()
                        : "",
                    feedback: typeof item.feedback === "string"
                        ? item.feedback.trim().slice(0, 1000)
                        : "",
                    note: typeof item.note === "string"
                        ? item.note.trim().slice(0, 1500)
                        : "",
                    source: item.source === "auto" ? "auto" : "manual",
                    corrected: Boolean(item.corrected),
                    mistakeCount: Math.max(1, Number(item.mistakeCount) || 1),
                    sessionId: (
                        typeof item.sessionId === "number"
                        || typeof item.sessionId === "string"
                    )
                        ? item.sessionId
                        : null,
                    createdAt: Number.isFinite(item.createdAt)
                        ? item.createdAt
                        : Date.now(),
                    updatedAt: Number.isFinite(item.updatedAt)
                        ? item.updatedAt
                        : Date.now(),
                    lastWrongAt: Number.isFinite(item.lastWrongAt)
                        ? item.lastWrongAt
                        : (
                            Number.isFinite(item.updatedAt)
                                ? item.updatedAt
                                : Date.now()
                        ),
                    correctedAt: Number.isFinite(item.correctedAt)
                        ? item.correctedAt
                        : null,
                    retestCount: Math.max(0, Number(item.retestCount) || 0),
                    retestPassCount: Math.max(0, Number(item.retestPassCount) || 0),
                    retestFailCount: Math.max(0, Number(item.retestFailCount) || 0),
                    retestPassed: Boolean(item.retestPassed),
                    retestPassedAt: Number.isFinite(item.retestPassedAt)
                        ? item.retestPassedAt
                        : null,
                    lastRetestAt: Number.isFinite(item.lastRetestAt)
                        ? item.lastRetestAt
                        : null,
                    lastRetestQuestion: typeof item.lastRetestQuestion === "string"
                        ? item.lastRetestQuestion.trim().slice(0, 3000)
                        : "",
                    lastRetestFeedback: typeof item.lastRetestFeedback === "string"
                        ? item.lastRetestFeedback.trim().slice(0, 1000)
                        : "",
                    lastRetestResult: ["correct", "wrong", "unknown"].includes(
                        item.lastRetestResult
                    )
                        ? item.lastRetestResult
                        : "",
                    lastRetestSessionId: (
                        typeof item.lastRetestSessionId === "number"
                        || typeof item.lastRetestSessionId === "string"
                    )
                        ? item.lastRetestSessionId
                        : null
                };
            })
            .filter(Boolean);

        // 老版本可能因为知识点识别略有不同，把同一道题存了多份。
        // 升级时按“题目本身”合并，避免用户看到重复卡片。
        const mergedMap = new Map();

        for (const item of normalizedWrong) {
            const key = wrongQuestionFingerprint(item.question);
            const existing = mergedMap.get(key);

            if (!existing) {
                mergedMap.set(key, item);
                continue;
            }

            const newer = item.updatedAt >= existing.updatedAt
                ? item
                : existing;
            const older = newer === item
                ? existing
                : item;

            newer.knowledgePoints = [
                ...new Set([
                    ...older.knowledgePoints,
                    ...newer.knowledgePoints
                ])
            ].slice(0, 4);

            newer.focusPoints = [
                ...new Set([
                    ...newer.focusPoints,
                    ...older.focusPoints
                ])
            ].slice(0, 2);

            newer.mistakeCount = (
                Math.max(1, Number(older.mistakeCount) || 1)
                + Math.max(1, Number(newer.mistakeCount) || 1)
            );

            // 同一道题的多个旧记录合并时，以更新时间更晚的状态为准。
            // 这样“后来已订正”不会被更早的待订正记录重新覆盖。
            newer.corrected = Boolean(newer.corrected);
            newer.correctedAt = newer.corrected
                ? (
                    Number(newer.correctedAt)
                    || Number(older.correctedAt)
                    || null
                )
                : null;

            newer.createdAt = Math.min(
                older.createdAt,
                newer.createdAt
            );

            newer.lastWrongAt = Math.max(
                older.lastWrongAt,
                newer.lastWrongAt
            );

            if (!newer.sessionId && older.sessionId) {
                newer.sessionId = older.sessionId;
            }

            if (!newer.note && older.note) {
                newer.note = older.note;
            }

            newer.retestCount = (
                (Number(older.retestCount) || 0)
                + (Number(newer.retestCount) || 0)
            );
            newer.retestPassCount = (
                (Number(older.retestPassCount) || 0)
                + (Number(newer.retestPassCount) || 0)
            );
            newer.retestFailCount = (
                (Number(older.retestFailCount) || 0)
                + (Number(newer.retestFailCount) || 0)
            );

            const newerRetestTime = Number(newer.lastRetestAt) || 0;
            const olderRetestTime = Number(older.lastRetestAt) || 0;

            if (olderRetestTime > newerRetestTime) {
                newer.lastRetestAt = older.lastRetestAt;
                newer.lastRetestQuestion = older.lastRetestQuestion;
                newer.lastRetestFeedback = older.lastRetestFeedback;
                newer.lastRetestResult = older.lastRetestResult;
            }

            newer.retestPassedAt = Math.max(
                Number(newer.retestPassedAt) || 0,
                Number(older.retestPassedAt) || 0
            ) || null;

            const latestWrongAt = Math.max(
                Number(newer.lastWrongAt) || 0,
                Number(older.lastWrongAt) || 0
            );

            newer.retestPassed = Boolean(
                newer.retestPassedAt
                && newer.retestPassedAt >= latestWrongAt
            );

            if (!newer.lastRetestSessionId && older.lastRetestSessionId) {
                newer.lastRetestSessionId = older.lastRetestSessionId;
            }

            mergedMap.set(key, newer);
        }

        state.wrongQuestions = [...mergedMap.values()]
            .sort((a, b) => a.updatedAt - b.updatedAt)
            .slice(-MAX_WRONG_QUESTIONS);
    }

    return state;
}

function loadLearningState() {
    try {
        const raw = localStorage.getItem(LEARNING_STORAGE_KEY);

        if (!raw) {
            learningState = createEmptyLearningState();
            return;
        }

        learningState = normalizeLearningState(
            JSON.parse(raw)
        );
    } catch (error) {
        console.warn("学习记录读取失败：", error);
        learningState = createEmptyLearningState();
    }
}

function saveLearningState() {
    try {
        localStorage.setItem(
            LEARNING_STORAGE_KEY,
            JSON.stringify(learningState)
        );
    } catch (error) {
        console.warn("学习记录保存失败：", error);
    }
}

function ensureKnowledgeRecord(name) {
    const point = String(name || "").trim();
    if (!point) return null;

    if (!learningState.knowledge[point]) {
        learningState.knowledge[point] = {
            seen: 0,
            correct: 0,
            wrong: 0,
            support: 0,
            reviewed: 0,
            updatedAt: Date.now()
        };
    }

    return learningState.knowledge[point];
}

function updateKnowledge(points, eventType) {
    const uniquePoints = [
        ...new Set(
            (Array.isArray(points) ? points : [])
                .filter(point => typeof point === "string" && point.trim())
                .map(point => point.trim())
        )
    ].slice(0, 4);

    if (!uniquePoints.length) return;

    for (const point of uniquePoints) {
        const record = ensureKnowledgeRecord(point);
        if (!record) continue;

        if (eventType === "seen") record.seen += 1;
        if (eventType === "correct") record.correct += 1;
        if (eventType === "wrong") record.wrong += 1;
        if (eventType === "support") record.support += 1;
        if (eventType === "reviewed") record.reviewed += 1;

        record.updatedAt = Date.now();
    }

    saveLearningState();
}

function knowledgeScore(record) {
    if (!record || typeof record !== "object") {
        return 50;
    }

    const score = (
        50
        + (record.correct || 0) * 14
        - (record.wrong || 0) * 20
        - (record.support || 0) * 6
        + (record.reviewed || 0) * 3
    );

    return Math.max(0, Math.min(100, score));
}

function knowledgeStatus(record) {
    const total = (
        (record?.seen || 0)
        + (record?.correct || 0)
        + (record?.wrong || 0)
        + (record?.support || 0)
    );

    if (!total) return "暂无记录";

    const score = knowledgeScore(record);

    if (score < 45) return "需要巩固";
    if (score < 70) return "学习中";
    if (score < 85) return "比较熟悉";
    return "掌握较稳";
}

function getLatestUserMessage(session) {
    if (!session || !Array.isArray(session.messages)) {
        return null;
    }

    for (let index = session.messages.length - 1; index >= 0; index -= 1) {
        const message = session.messages[index];

        if (
            message
            && message.role === "user"
            && typeof message.text === "string"
            && message.text.trim()
        ) {
            return message;
        }
    }

    return null;
}

function isShortLearningFollowUp(text) {
    const value = String(text || "")
        .trim()
        .replace(/\s+/g, "");

    if (!value) return true;

    const exactCommands = [
        "继续",
        "再提示一下",
        "再给个提示",
        "给我提示",
        "完整解析",
        "给我完整解析",
        "直接给答案",
        "告诉我答案",
        "为什么",
        "然后呢",
        "下一步呢",
        "再讲一下",
        "再解释一下",
        "换个写法",
        "换一种写法",
        "列一下",
        "写一下",
        "展开一下",
        "用大括号列一下",
        "用大括号写一下",
        "用矩阵写一下",
        "这个怎么看",
        "这个怎么写",
        "这一步怎么写"
    ];

    if (exactCommands.includes(value)) {
        return true;
    }

    // 这类短句通常是在追问“怎么表示/怎么改写”，不是一道新题。
    const followUpPatterns = [
        /用.+(?:列|写|表示|展开)一下$/,
        /(?:再|重新).+(?:讲|写|列|解释|说明)一下$/,
        /(?:换|改).+(?:写法|表示|形式)$/,
        /^(?:这个|这里|这一步|上面|刚才).{0,12}(?:怎么|为什么|什么意思|看不懂|不明白)/,
        /(?:怎么写|怎么表示|怎么列|什么意思|看不懂|不明白)$/
    ];

    if (
        value.length <= 30
        && followUpPatterns.some(pattern => pattern.test(value))
    ) {
        return true;
    }

    return value.length <= 6;
}

function looksLikeActualLearningProblem(message) {
    if (
        !message
        || typeof message.text !== "string"
    ) {
        return false;
    }

    if (message.source === "ocr") {
        return true;
    }

    const text = message.text.trim();
    if (!text || isShortLearningFollowUp(text)) {
        return false;
    }

    const compact = text.replace(/\s+/g, "");

    // 明显的题目结构或题干用语。
    const problemSignals = [
        "【题目文字】",
        "【图形信息】",
        "[图片识题]",
        "已知",
        "设",
        "求",
        "求解",
        "证明",
        "判断",
        "计算",
        "写出",
        "列出",
        "回答下列问题",
        "选择题",
        "证明题",
        "计算题"
    ];

    if (
        problemSignals.some(signal => compact.includes(signal))
    ) {
        return true;
    }

    if (/[（(]\s*[1-9]\s*[)）]/.test(text)) {
        return true;
    }

    // 一般完整题目会比“换个写法/再提示一下”长很多。
    if (text.length >= 80) {
        return true;
    }

    return false;
}

function buildLearningQuestionFromSession(session, teaching, excludeLatest = false) {
    if (!session || !Array.isArray(session.messages)) {
        return null;
    }

    const end = excludeLatest
        ? session.messages.length - 2
        : session.messages.length - 1;

    for (let index = end; index >= 0; index -= 1) {
        const message = session.messages[index];

        if (
            !message
            || message.role !== "user"
            || typeof message.text !== "string"
        ) {
            continue;
        }

        const text = message.text.trim();
        if (!text) continue;

        if (message.isRetestPrompt || message.isRetestAnswer) {
            continue;
        }

        if (!looksLikeActualLearningProblem(message)) {
            continue;
        }

        return {
            text: text.slice(0, 3000),
            knowledgePoints: Array.isArray(teaching?.knowledge_points)
                ? teaching.knowledge_points.slice(0, 4)
                : [],
            focusPoints: Array.isArray(teaching?.focus_points)
                ? teaching.focus_points.slice(0, 2)
                : [],
            category: typeof teaching?.category === "string"
                ? teaching.category
                : "",
            source: message.source === "ocr" ? "ocr" : "text",
            sessionId: session.id,
            updatedAt: Date.now()
        };
    }

    return null;
}

function inferAnswerAssessment(reply) {
    let text = String(reply || "").replace(/\s+/g, " ").trim();

    if (!text) return "unknown";

    const strongPositive = [
        "完全正确",
        "这次作答正确",
        "作答正确",
        "答案正确",
        "结果正确",
        "计算正确",
        "没有错误",
        "没有问题",
        "没错",
        "是对的"
    ];

    const hasPositive = strongPositive.some(
        phrase => text.includes(phrase)
    );

    for (const phrase of strongPositive) {
        text = text.split(phrase).join("");
    }

    const negative = [
        "不正确",
        "这次作答有错误",
        "作答有错误",
        "答案有误",
        "结果有误",
        "存在错误",
        "这里错了",
        "这一步错",
        "算错",
        "写错",
        "错误在",
        "最早出错",
        "不成立",
        "需要修改",
        "需要纠正",
        "有一个错误",
        "有一处错误"
    ];

    if (negative.some(phrase => text.includes(phrase))) {
        return "wrong";
    }

    return hasPositive ? "correct" : "unknown";
}

function compactFeedback(text) {
    return String(text || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1000);
}

function wrongQuestionFingerprint(question) {
    return String(question || "")
        .toLowerCase()
        .replace(/[【】\[\]（）()，,。.!！?？:：;；"'“”‘’`]/g, "")
        .replace(/\s+/g, "")
        .slice(0, 1600);
}

function wrongBookLearningPoints(entryOrQuestion) {
    const focus = Array.isArray(entryOrQuestion?.focusPoints)
        ? entryOrQuestion.focusPoints.filter(Boolean)
        : [];

    if (focus.length) {
        return focus.slice(0, 2);
    }

    return Array.isArray(entryOrQuestion?.knowledgePoints)
        ? entryOrQuestion.knowledgePoints.filter(Boolean).slice(0, 4)
        : [];
}

function addWrongQuestion(questionInfo, feedback, source = "auto") {
    const info = normalizeLearningQuestion(questionInfo);
    if (!info) return { entry: null, countAsMistake: false };

    const fingerprint = wrongQuestionFingerprint(info.text);

    const existing = learningState.wrongQuestions.find(
        item => wrongQuestionFingerprint(item.question) === fingerprint
    );

    const now = Date.now();

    if (existing) {
        const wasCorrected = Boolean(existing.corrected);

        existing.feedback = compactFeedback(feedback) || existing.feedback;

        existing.knowledgePoints = [
            ...new Set([
                ...existing.knowledgePoints,
                ...info.knowledgePoints
            ])
        ].slice(0, 4);

        if (info.focusPoints.length) {
            existing.focusPoints = info.focusPoints.slice(0, 2);
        }

        if (info.category) {
            existing.category = info.category;
        }

        if (info.sessionId !== null) {
            existing.sessionId = info.sessionId;
        }

        if (source === "auto") {
            existing.source = "auto";
        }

        existing.corrected = false;
        existing.correctedAt = null;
        existing.updatedAt = now;
        existing.lastWrongAt = now;

        // 手动重复点“记为错题”不重复累计；
        // 真正再次答错，或订正后重新加入，才算一次新的错误记录。
        const countAsMistake = (
            source === "auto"
            || wasCorrected
        );

        if (countAsMistake) {
            existing.mistakeCount += 1;
            existing.retestPassed = false;
            existing.retestPassedAt = null;
        }

        saveLearningState();

        return {
            entry: existing,
            countAsMistake
        };
    }

    const entry = {
        id: `wrong-${now}-${Math.random().toString(36).slice(2, 8)}`,
        question: info.text,
        knowledgePoints: info.knowledgePoints,
        focusPoints: info.focusPoints,
        category: info.category,
        feedback: compactFeedback(feedback),
        note: "",
        source: source === "auto" ? "auto" : "manual",
        corrected: false,
        mistakeCount: 1,
        sessionId: info.sessionId,
        createdAt: now,
        updatedAt: now,
        lastWrongAt: now,
        correctedAt: null,
        retestCount: 0,
        retestPassCount: 0,
        retestFailCount: 0,
        retestPassed: false,
        retestPassedAt: null,
        lastRetestAt: null,
        lastRetestQuestion: "",
        lastRetestFeedback: "",
        lastRetestResult: "",
        lastRetestSessionId: null
    };

    learningState.wrongQuestions.push(entry);

    if (learningState.wrongQuestions.length > MAX_WRONG_QUESTIONS) {
        learningState.wrongQuestions = learningState.wrongQuestions
            .slice(-MAX_WRONG_QUESTIONS);
    }

    saveLearningState();

    return {
        entry,
        countAsMistake: true
    };
}

function currentLearningQuestion(session, teaching) {
    const saved = normalizeLearningQuestion(
        session?.learningQuestion
    );

    if (saved) {
        return saved;
    }

    return buildLearningQuestionFromSession(
        session,
        teaching,
        true
    ) || buildLearningQuestionFromSession(
        session,
        teaching,
        false
    );
}

function processLearningFromReply(session, teaching, reply) {
    const normalized = normalizeTeaching(teaching);

    if (!session || !normalized) {
        return;
    }

    const points = normalized.knowledge_points;
    const latest = getLatestUserMessage(session);
    const latestText = latest?.text || "";

    const isSubstantiveQuestion = Boolean(
        latest
        && looksLikeActualLearningProblem(latest)
        && normalized.mode !== "check_answer"
        && normalized.mode !== "exercise"
    );

    if (isSubstantiveQuestion && points.length) {
        session.learningQuestion = {
            text: latestText.slice(0, 3000),
            knowledgePoints: points.slice(0, 4),
            focusPoints: normalized.focus_points.slice(0, 2),
            category: normalized.category,
            source: latest.source === "ocr" ? "ocr" : "text",
            sessionId: session.id,
            updatedAt: Date.now()
        };

        updateKnowledge(points, "seen");
    }

    if (
        normalized.mode === "full_solution"
        && points.length
    ) {
        updateKnowledge(points, "support");
    }

    const selfReportsWrong = /(?:我|这题|刚才).{0,8}(?:做错|算错|写错|错了)/.test(
        latestText.replace(/\s+/g, "")
    );

    if (
        normalized.mode === "check_answer"
        || selfReportsWrong
    ) {
        const assessment = selfReportsWrong
            ? "wrong"
            : inferAnswerAssessment(reply);

        if (assessment === "wrong") {
            const questionInfo = currentLearningQuestion(
                session,
                normalized
            );

            const added = addWrongQuestion(
                questionInfo,
                selfReportsWrong
                    ? "你明确表示这道题做错了，建议完成订正后再标记为已订正。"
                    : reply,
                "auto"
            );

            if (added.countAsMistake) {
                updateKnowledge(
                    wrongBookLearningPoints(
                        questionInfo || {
                            knowledgePoints: points,
                            focusPoints: normalized.focus_points
                        }
                    ),
                    "wrong"
                );
            }
        } else if (assessment === "correct") {
            updateKnowledge(
                normalized.focus_points.length
                    ? normalized.focus_points
                    : points,
                "correct"
            );
        }
    }

    saveState();
    saveLearningState();
    renderLearningSummary();
}

function manualMarkCurrentWrong() {
    const session = getCurrent();
    const teaching = normalizeTeaching(session?.teaching);

    if (!session || !teaching) return;

    const questionInfo = currentLearningQuestion(
        session,
        teaching
    );

    if (!questionInfo) return;

    const result = addWrongQuestion(
        questionInfo,
        "这道题已加入错题本。完成订正后，可以标记为“已订正”。",
        "manual"
    );

    if (result.countAsMistake) {
        updateKnowledge(
            wrongBookLearningPoints(questionInfo),
            "wrong"
        );
    }

    saveState();
    renderLearningSummary();
    renderWrongBook();

    const button = document.getElementById("markWrongBtn");
    if (button) {
        const previous = button.textContent;
        button.textContent = "已记录";

        setTimeout(() => {
            button.textContent = previous;
            renderLearningSummary();
        }, 900);
    }
}

function formatLearningDate(timestamp) {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleString(
        "zh-CN",
        {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }
    )
        .replace("/", "月")
        .replace(",", "日");
}

function renderLearningSummary() {
    const box = document.getElementById("learningSummary");
    const markButton = document.getElementById("markWrongBtn");
    const wrongButton = document.getElementById("wrongBookBtn");

    if (!box) return;

    const entries = Object.entries(
        learningState.knowledge || {}
    );

    const weak = entries
        .filter(([_name, record]) => (
            knowledgeStatus(record) === "需要巩固"
        ))
        .sort((a, b) => knowledgeScore(a[1]) - knowledgeScore(b[1]))
        .slice(0, 3)
        .map(([name]) => name);

    const familiar = entries
        .filter(([_name, record]) => (
            ["比较熟悉", "掌握较稳"].includes(
                knowledgeStatus(record)
            )
        ))
        .sort((a, b) => knowledgeScore(b[1]) - knowledgeScore(a[1]))
        .slice(0, 3)
        .map(([name]) => name);

    const wrongCount = learningState.wrongQuestions.length;
    const pendingWrong = learningState.wrongQuestions
        .filter(item => !item.corrected)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    const pendingCount = pendingWrong.length;
    const passedCount = learningState.wrongQuestions
        .filter(item => item.retestPassed)
        .length;
    const recentFocus = pendingWrong.find(
        item => Array.isArray(item.focusPoints) && item.focusPoints.length
    );

    const lines = [];

    if (!entries.length && !wrongCount) {
        lines.push(
            "还没有足够的学习记录。",
            "做题、检查答案或加入错题后，这里会慢慢形成你的学习情况。"
        );
    } else {
        if (recentFocus) {
            lines.push(
                `最近主要卡在：${recentFocus.focusPoints.join("、")}`
            );
        }

        if (weak.length) {
            lines.push(
                `最近需要巩固：${weak.join("、")}`
            );
        }

        if (familiar.length) {
            lines.push(
                `目前比较熟悉：${familiar.join("、")}`
            );
        }

        if (!weak.length && !familiar.length && entries.length) {
            lines.push("目前正在积累学习记录。");
        }

        lines.push(
            `错题本：${wrongCount} 道，待订正 ${pendingCount} 道，已通过复测 ${passedCount} 道`
        );
    }

    box.innerText = lines.join("\n");

    if (wrongButton) {
        wrongButton.textContent = `查看错题本 (${wrongCount})`;
    }

    if (markButton) {
        const session = getCurrent();
        const teaching = normalizeTeaching(session?.teaching);

        markButton.disabled = !(
            session
            && teaching
            && currentLearningQuestion(session, teaching)
        );
    }
}


function setWrongBookFilter(filter) {
    if (!["pending", "corrected", "passed"].includes(filter)) {
        return;
    }

    // 不再单独放“全部”按钮：
    // 未选择任何状态时就是“全部”；
    // 再点一次当前筛选即可取消筛选。
    wrongBookFilter = (
        wrongBookFilter === filter
            ? "all"
            : filter
    );

    renderWrongBook();
}

function setWrongBookSearch(value) {
    wrongBookSearch = String(value || "")
        .trim()
        .toLowerCase();

    renderWrongBook();
}

function setWrongBookSort(value) {
    if (!["recent", "oldest", "mistakes"].includes(value)) {
        return;
    }

    wrongBookSort = value;
    renderWrongBook();
}

function wrongBookStatus(item) {
    if (item.retestPassed) {
        return {
            key: "passed",
            text: "已通过复测",
            className: "passed"
        };
    }

    if (item.corrected) {
        return {
            key: "corrected",
            text: "已完成订正",
            className: "corrected"
        };
    }

    if (item.lastRetestResult === "wrong") {
        return {
            key: "pending",
            text: "复测未通过",
            className: "failed"
        };
    }

    return {
        key: "pending",
        text: "待订正",
        className: ""
    };
}

function wrongBookSearchText(item) {
    return [
        item.question,
        item.category,
        ...(item.knowledgePoints || []),
        ...(item.focusPoints || []),
        item.feedback,
        item.note,
        item.lastRetestQuestion,
        item.lastRetestFeedback
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function getFilteredWrongBookItems() {
    let items = [...learningState.wrongQuestions];

    if (wrongBookFilter !== "all") {
        items = items.filter(
            item => wrongBookStatus(item).key === wrongBookFilter
        );
    }

    if (wrongBookSearch) {
        items = items.filter(
            item => wrongBookSearchText(item).includes(wrongBookSearch)
        );
    }

    if (wrongBookSort === "oldest") {
        items.sort((a, b) => a.updatedAt - b.updatedAt);
    } else if (wrongBookSort === "mistakes") {
        items.sort((a, b) => (
            b.mistakeCount - a.mistakeCount
            || b.updatedAt - a.updatedAt
        ));
    } else {
        items.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    return items;
}

function updateWrongBookToolbar(allItems, visibleItems) {
    const stats = document.getElementById("wrongBookStats");
    const filterButtons = document.querySelectorAll(
        "[data-wrong-filter]"
    );

    const total = allItems.length;
    const pending = allItems.filter(
        item => wrongBookStatus(item).key === "pending"
    ).length;
    const corrected = allItems.filter(
        item => wrongBookStatus(item).key === "corrected"
    ).length;
    const passed = allItems.filter(
        item => wrongBookStatus(item).key === "passed"
    ).length;

    if (stats) {
        const visibleText = visibleItems.length === total
            ? ""
            : ` · 当前显示 ${visibleItems.length} 道`;

        stats.textContent =
            `共 ${total} 道 · 待处理 ${pending} · 已订正 ${corrected} · 已通过复测 ${passed}${visibleText}`;
    }

    for (const button of filterButtons) {
        const value = button.getAttribute("data-wrong-filter");
        button.classList.toggle(
            "active",
            value === wrongBookFilter
        );
    }
}

function openWrongBook() {
    const modal = document.getElementById("wrongBookModal");
    if (!modal) return;

    renderWrongBook();
    modal.classList.remove("hidden");

    const search = document.getElementById("wrongBookSearch");
    if (search) {
        search.value = wrongBookSearch;
    }
}

function closeWrongBook() {
    const modal = document.getElementById("wrongBookModal");
    if (!modal) return;

    modal.classList.add("hidden");
}

function markWrongQuestionCorrected(id) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry || entry.corrected) return;

    const now = Date.now();

    entry.corrected = true;
    entry.correctedAt = now;
    entry.updatedAt = now;

    updateKnowledge(
        wrongBookLearningPoints(entry),
        "reviewed"
    );

    saveLearningState();
    renderLearningSummary();
    renderWrongBook();
}

function removeWrongQuestion(id) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry) return;

    const confirmed = window.confirm(
        "确定要把这道题移出错题本吗？这不会删除原聊天。"
    );

    if (!confirmed) return;

    learningState.wrongQuestions = learningState.wrongQuestions.filter(
        item => item.id !== id
    );

    saveLearningState();
    renderLearningSummary();
    renderWrongBook();
}

function clearCompletedWrongQuestions() {
    const completed = learningState.wrongQuestions.filter(
        item => item.corrected || item.retestPassed
    );

    if (!completed.length) {
        window.alert("目前没有可以清理的已完成错题。");
        return;
    }

    const confirmed = window.confirm(
        `确定移出 ${completed.length} 道已完成的错题吗？原聊天不会被删除。`
    );

    if (!confirmed) return;

    const completedIds = new Set(
        completed.map(item => item.id)
    );

    learningState.wrongQuestions = learningState.wrongQuestions.filter(
        item => !completedIds.has(item.id)
    );

    saveLearningState();
    renderLearningSummary();
    renderWrongBook();
}

function openWrongQuestionSession(id) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry || entry.sessionId === null) return;

    const session = sessions.find(
        item => String(item.id) === String(entry.sessionId)
    );

    if (!session) return;

    if (typingTimer) {
        forceCompleteTyping();
    }

    currentId = session.id;
    saveState();
    closeWrongBook();
    renderAll();
}

function openWrongRetestSession(id) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry || entry.lastRetestSessionId === null) return;

    const session = sessions.find(
        item => String(item.id) === String(entry.lastRetestSessionId)
    );

    if (!session) return;

    if (typingTimer) {
        forceCompleteTyping();
    }

    currentId = session.id;
    saveState();
    closeWrongBook();
    renderAll();
}

function openWrongEdit(id) {
    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry) return;

    currentWrongEditId = id;

    const modal = document.getElementById("wrongEditModal");
    const question = document.getElementById("wrongEditQuestion");
    const focus = document.getElementById("wrongEditFocus");
    const note = document.getElementById("wrongEditNote");

    if (!modal || !question || !focus || !note) return;

    question.value = entry.question;
    focus.value = (entry.focusPoints || []).join("、");
    note.value = entry.note || "";

    modal.classList.remove("hidden");
}

function closeWrongEdit() {
    const modal = document.getElementById("wrongEditModal");
    if (modal) {
        modal.classList.add("hidden");
    }

    currentWrongEditId = null;
}

function saveWrongEdit() {
    const entry = learningState.wrongQuestions.find(
        item => item.id === currentWrongEditId
    );

    if (!entry) {
        closeWrongEdit();
        return;
    }

    const questionBox = document.getElementById("wrongEditQuestion");
    const focusBox = document.getElementById("wrongEditFocus");
    const noteBox = document.getElementById("wrongEditNote");

    if (!questionBox || !focusBox || !noteBox) return;

    const question = questionBox.value.trim();

    if (!question) {
        window.alert("题目内容不能为空。");
        return;
    }

    const duplicate = learningState.wrongQuestions.find(
        item => (
            item.id !== entry.id
            && wrongQuestionFingerprint(item.question)
                === wrongQuestionFingerprint(question)
        )
    );

    if (duplicate) {
        window.alert("错题本里已经有这道题了，请不要重复保存。");
        return;
    }

    const focusPoints = focusBox.value
        .split(/[、,，;；]/)
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 2);

    entry.question = question.slice(0, 3000);
    entry.focusPoints = focusPoints;
    entry.note = noteBox.value.trim().slice(0, 1500);

    if (focusPoints.length) {
        entry.knowledgePoints = [
            ...new Set([
                ...focusPoints,
                ...(entry.knowledgePoints || [])
            ])
        ].slice(0, 4);
    }

    entry.updatedAt = Date.now();

    saveLearningState();
    closeWrongEdit();
    renderLearningSummary();
    renderWrongBook();
}

function buildRetestPrompt(entry) {
    const target = wrongBookLearningPoints(entry);
    const targetText = target.length
        ? target.join("、")
        : (
            entry.category
            || "这道题涉及的核心知识点"
        );

    return [
        "【错题复测】",
        `请围绕知识点“${targetText}”生成 1 道新的离散数学复测题。`,
        "要求：",
        "1. 与下面原错题考查同一核心能力，但题面、数字或结构必须明显不同；",
        "2. 难度与原题大致相当，不要故意变难；",
        "3. 只给复测题目，不给答案、提示、解析或解题步骤；",
        "4. 题目必须信息完整、可独立作答；",
        "",
        "原错题：",
        entry.question
    ].join("\n");
}

function startWrongQuestionRetest(id) {
    if (typingTimer || requestBusy) {
        return;
    }

    const entry = learningState.wrongQuestions.find(
        item => item.id === id
    );

    if (!entry) return;

    if (!entry.corrected && !entry.retestPassed) {
        window.alert("请先完成这道错题的订正，再进行复测。");
        return;
    }

    const targetPoints = wrongBookLearningPoints(entry);
    const idValue = makeSessionId();
    const targetName = targetPoints.length
        ? targetPoints[0]
        : "错题";

    const visiblePrompt =
        `给我一道“${targetName}”的同知识点复测题。`;

    const session = {
        id: idValue,
        name: `复测：${targetName}`.slice(0, 22),
        messages: [{
            role: "user",
            text: visiblePrompt,
            apiText: buildRetestPrompt(entry),
            isRetestPrompt: true
        }],
        teaching: null,
        learningQuestion: null,
        retest: {
            wrongQuestionId: entry.id,
            stage: "generating",
            targetPoints,
            generatedQuestion: "",
            startedAt: Date.now(),
            result: ""
        }
    };

    sessions.push(session);
    currentId = session.id;

    entry.lastRetestSessionId = session.id;
    entry.updatedAt = Date.now();

    saveLearningState();
    saveState();
    closeWrongBook();
    renderAll();

    requestAiReply(session);
}

function processWrongQuestionRetestReply(session, reply) {
    const retest = normalizeRetestSession(session?.retest);

    if (!session || !retest || !retest.wrongQuestionId) {
        return false;
    }

    const entry = learningState.wrongQuestions.find(
        item => item.id === retest.wrongQuestionId
    );

    if (!entry) {
        session.retest = null;
        saveState();
        return false;
    }

    if (retest.stage === "generating") {
        retest.generatedQuestion = String(reply || "")
            .trim()
            .slice(0, 3000);
        retest.stage = "awaiting_answer";
        session.retest = retest;

        saveState();
        return true;
    }

    if (retest.stage !== "checking") {
        return false;
    }

    const assessment = inferAnswerAssessment(reply);
    const now = Date.now();

    entry.lastRetestAt = now;
    entry.lastRetestSessionId = session.id;
    entry.lastRetestQuestion = (
        retest.generatedQuestion
        || entry.lastRetestQuestion
        || ""
    ).slice(0, 3000);
    entry.lastRetestFeedback = compactFeedback(reply);
    entry.lastRetestResult = assessment;

    if (assessment === "correct") {
        entry.retestCount += 1;
        entry.retestPassCount += 1;
        entry.retestPassed = true;
        entry.retestPassedAt = now;
        entry.corrected = true;
        entry.correctedAt = entry.correctedAt || now;

        updateKnowledge(
            retest.targetPoints.length
                ? retest.targetPoints
                : wrongBookLearningPoints(entry),
            "correct"
        );
    } else if (assessment === "wrong") {
        entry.retestCount += 1;
        entry.retestFailCount += 1;
        entry.retestPassed = false;
        entry.retestPassedAt = null;
        entry.corrected = false;
        entry.correctedAt = null;

        updateKnowledge(
            retest.targetPoints.length
                ? retest.targetPoints
                : wrongBookLearningPoints(entry),
            "wrong"
        );
    }

    entry.updatedAt = now;

    retest.result = assessment;
    retest.stage = assessment === "unknown"
        ? "awaiting_answer"
        : "finished";
    session.retest = retest;

    saveState();
    saveLearningState();
    renderLearningSummary();
    renderWrongBook();

    return true;
}

function rollbackRetestAfterRequestFailure(session) {
    const retest = normalizeRetestSession(session?.retest);
    if (!retest) return;

    if (retest.stage === "checking") {
        retest.stage = "awaiting_answer";
        session.retest = retest;
    } else if (retest.stage === "generating") {
        session.retest = null;
    }

    saveState();
}

function buildWrongBookPdfExportElement(items) {
    const container = document.createElement("div");
    container.className = "wrong-pdf-export";
    container.style.position = "fixed";
    container.style.left = "-100000px";
    container.style.top = "0";
    container.style.width = "794px";
    container.style.padding = "34px 40px";
    container.style.background = "#ffffff";
    container.style.color = "#111827";
    container.style.fontFamily = 'Arial, "Microsoft YaHei", "PingFang SC", sans-serif';
    container.style.lineHeight = "1.65";
    container.style.zIndex = "-1";

    const title = document.createElement("div");
    title.style.fontSize = "28px";
    title.style.fontWeight = "700";
    title.style.marginBottom = "6px";
    title.textContent = "离散数学错题本";
    container.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.style.fontSize = "13px";
    subtitle.style.color = "#64748b";
    subtitle.style.marginBottom = "22px";
    subtitle.textContent = (
        `共 ${items.length} 道 · 导出时间：${new Date().toLocaleString("zh-CN")}`
    );
    container.appendChild(subtitle);

    items.forEach((item, index) => {
        const status = wrongBookStatus(item);
        const card = document.createElement("section");
        card.className = "wrong-pdf-card";
        card.style.padding = "18px 0 20px";
        card.style.borderTop = (
            index === 0
                ? "0"
                : "1px solid #e2e8f0"
        );

        const statusLine = document.createElement("div");
        statusLine.style.fontSize = "15px";
        statusLine.style.fontWeight = "700";
        statusLine.style.marginBottom = "10px";
        statusLine.textContent = `${index + 1}. ${status.text}`;
        card.appendChild(statusLine);

        const question = document.createElement("div");
        question.className = "wrong-pdf-question";
        question.style.fontSize = "15px";
        question.style.whiteSpace = "pre-wrap";
        question.style.wordBreak = "break-word";
        question.innerHTML = markdownToHtml(item.question);
        card.appendChild(question);

        const metaParts = [];

        if (item.focusPoints?.length) {
            metaParts.push(
                `本次主要卡在：${item.focusPoints.join("、")}`
            );
        }

        if (item.knowledgePoints?.length) {
            metaParts.push(
                `整题涉及：${item.knowledgePoints.join("、")}`
            );
        }

        metaParts.push(
            `累计记录错误：${item.mistakeCount || 1} 次`
        );

        if (item.retestCount) {
            metaParts.push(
                `复测 ${item.retestCount} 次，通过 ${item.retestPassCount || 0} 次`
            );
        }

        const meta = document.createElement("div");
        meta.style.marginTop = "10px";
        meta.style.fontSize = "12px";
        meta.style.color = "#64748b";
        meta.textContent = metaParts.join(" · ");
        card.appendChild(meta);

        if (item.feedback) {
            const block = document.createElement("div");
            block.style.marginTop = "12px";
            block.style.padding = "10px 12px";
            block.style.borderRadius = "8px";
            block.style.background = "#f8fafc";
            block.style.fontSize = "13px";

            const label = document.createElement("div");
            label.style.fontWeight = "700";
            label.style.marginBottom = "4px";
            label.textContent = "最近反馈";
            block.appendChild(label);

            const body = document.createElement("div");
            body.innerHTML = markdownToHtml(item.feedback);
            block.appendChild(body);

            card.appendChild(block);
        }

        if (item.note) {
            const block = document.createElement("div");
            block.style.marginTop = "10px";
            block.style.padding = "10px 12px";
            block.style.borderRadius = "8px";
            block.style.background = "#f8fafc";
            block.style.fontSize = "13px";

            const label = document.createElement("div");
            label.style.fontWeight = "700";
            label.style.marginBottom = "4px";
            label.textContent = "我的笔记";
            block.appendChild(label);

            const body = document.createElement("div");
            body.innerHTML = markdownToHtml(item.note);
            block.appendChild(body);

            card.appendChild(block);
        }

        if (item.lastRetestQuestion) {
            const block = document.createElement("div");
            block.style.marginTop = "10px";
            block.style.padding = "10px 12px";
            block.style.borderRadius = "8px";
            block.style.border = "1px solid #e2e8f0";
            block.style.fontSize = "13px";

            const label = document.createElement("div");
            label.style.fontWeight = "700";
            label.style.marginBottom = "4px";
            label.textContent = "最近复测题";
            block.appendChild(label);

            const body = document.createElement("div");
            body.innerHTML = markdownToHtml(item.lastRetestQuestion);
            block.appendChild(body);

            card.appendChild(block);
        }

        container.appendChild(card);
    });

    document.body.appendChild(container);
    return container;
}

async function typesetWrongBookPdfElement(container) {
    if (
        window.MathJax
        && MathJax.typesetPromise
    ) {
        try {
            await MathJax.typesetPromise([container]);
        } catch (error) {
            console.warn("导出 PDF 时公式渲染失败：", error);
        }
    }

    if (document.fonts?.ready) {
        try {
            await document.fonts.ready;
        } catch (_error) {
            // 字体等待失败不阻止导出。
        }
    }
}

function canvasSlice(sourceCanvas, startY, sliceHeight) {
    const slice = document.createElement("canvas");
    slice.width = sourceCanvas.width;
    slice.height = sliceHeight;

    const context = slice.getContext("2d");
    context.drawImage(
        sourceCanvas,
        0,
        startY,
        sourceCanvas.width,
        sliceHeight,
        0,
        0,
        sourceCanvas.width,
        sliceHeight
    );

    return slice;
}

async function exportWrongBookPdf() {
    const items = getFilteredWrongBookItems();

    if (!items.length) {
        window.alert("当前没有可以导出的错题。");
        return;
    }

    if (
        typeof window.html2canvas !== "function"
        || !window.jspdf?.jsPDF
    ) {
        window.alert(
            "PDF 组件加载失败，请刷新页面后重试。"
        );
        return;
    }

    const button = document.getElementById(
        "wrongPdfBtn"
    );
    const originalText = button?.textContent || "";

    if (button) {
        button.disabled = true;
        button.textContent = "正在生成 PDF…";
    }

    let exportElement = null;

    try {
        exportElement = buildWrongBookPdfExportElement(
            items
        );

        await typesetWrongBookPdfElement(
            exportElement
        );

        const {
            jsPDF
        } = window.jspdf;

        const pdf = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
            compress: true
        });

        const pageWidth = 210;
        const pageHeight = 297;
        const marginX = 12;
        const marginY = 12;
        const usableWidth = pageWidth - marginX * 2;
        const usableHeight = pageHeight - marginY * 2;

        const sections = [
            ...exportElement.children
        ];

        let currentY = marginY;
        let hasContent = false;

        for (const section of sections) {
            const canvas = await window.html2canvas(
                section,
                {
                    scale: 2,
                    backgroundColor: "#ffffff",
                    useCORS: true,
                    logging: false
                }
            );

            if (!canvas.width || !canvas.height) {
                continue;
            }

            const renderedHeight = (
                canvas.height
                * usableWidth
                / canvas.width
            );

            const remaining = (
                usableHeight
                - (currentY - marginY)
            );

            if (
                hasContent
                && renderedHeight > remaining
            ) {
                pdf.addPage();
                currentY = marginY;
            }

            if (renderedHeight <= usableHeight) {
                const image = canvas.toDataURL(
                    "image/jpeg",
                    0.92
                );

                pdf.addImage(
                    image,
                    "JPEG",
                    marginX,
                    currentY,
                    usableWidth,
                    renderedHeight,
                    undefined,
                    "FAST"
                );

                currentY += renderedHeight + 4;
                hasContent = true;
                continue;
            }

            // 单个内容块超过一页时，按像素切片，避免被截断。
            const pixelsPerMm = canvas.width / usableWidth;
            const fullPagePixels = Math.max(
                1,
                Math.floor(
                    usableHeight * pixelsPerMm
                )
            );

            let startY = 0;

            while (startY < canvas.height) {
                if (hasContent) {
                    pdf.addPage();
                }

                const sliceHeight = Math.min(
                    fullPagePixels,
                    canvas.height - startY
                );

                const slice = canvasSlice(
                    canvas,
                    startY,
                    sliceHeight
                );

                const sliceHeightMm = (
                    sliceHeight
                    * usableWidth
                    / canvas.width
                );

                pdf.addImage(
                    slice.toDataURL(
                        "image/jpeg",
                        0.92
                    ),
                    "JPEG",
                    marginX,
                    marginY,
                    usableWidth,
                    sliceHeightMm,
                    undefined,
                    "FAST"
                );

                hasContent = true;
                currentY = marginY + sliceHeightMm + 4;
                startY += sliceHeight;
            }
        }

        const date = new Date()
            .toISOString()
            .slice(0, 10);

        pdf.save(
            `离散数学错题本-${date}.pdf`
        );
    } catch (error) {
        console.error("错题本 PDF 导出失败：", error);

        window.alert(
            "PDF 生成失败，请刷新页面后重试。"
        );
    } finally {
        exportElement?.remove();

        if (button) {
            button.disabled = false;
            button.textContent = originalText || "导出 PDF";
        }
    }
}


function renderWrongBook() {
    const list = document.getElementById("wrongBookList");
    if (!list) return;

    list.innerHTML = "";

    const allItems = [...learningState.wrongQuestions];
    const items = getFilteredWrongBookItems();

    updateWrongBookToolbar(allItems, items);

    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "wrong-empty";

        if (!allItems.length) {
            empty.textContent = "错题本还是空的。";
        } else if (wrongBookSearch) {
            empty.textContent = "没有找到匹配的错题。";
        } else if (wrongBookFilter === "pending") {
            empty.textContent = "目前没有待处理的错题。";
        } else if (wrongBookFilter === "corrected") {
            empty.textContent = "目前没有已完成订正但未通过复测的错题。";
        } else {
            empty.textContent = "目前还没有已通过复测的错题。";
        }

        list.appendChild(empty);
        return;
    }

    for (const item of items) {
        const card = document.createElement("div");
        card.className = "wrong-card";

        const top = document.createElement("div");
        top.className = "wrong-card-top";

        const statusInfo = wrongBookStatus(item);
        const status = document.createElement("span");
        status.className = [
            "wrong-status",
            statusInfo.className
        ]
            .filter(Boolean)
            .join(" ");
        status.textContent = statusInfo.text;

        const date = document.createElement("span");
        date.className = "wrong-date";
        date.textContent = formatLearningDate(item.updatedAt);

        top.appendChild(status);
        top.appendChild(date);

        const question = document.createElement("div");
        question.className = "wrong-question";
        question.innerHTML = markdownToHtml(item.question);

        const meta = document.createElement("div");
        meta.className = "wrong-meta";

        const appendMetaRow = (
            label,
            value,
            className = ""
        ) => {
            if (!value) return;

            const row = document.createElement("div");
            row.className = [
                "wrong-meta-row",
                className
            ]
                .filter(Boolean)
                .join(" ");

            const labelNode = document.createElement("span");
            labelNode.className = "wrong-meta-label";
            labelNode.textContent = label;

            const valueNode = document.createElement("span");
            valueNode.className = "wrong-meta-value";
            valueNode.textContent = value;

            row.appendChild(labelNode);
            row.appendChild(valueNode);
            meta.appendChild(row);
        };

        if (item.focusPoints.length) {
            appendMetaRow(
                "本次主要卡在",
                item.focusPoints.join("、"),
                "focus"
            );
        }

        if (item.knowledgePoints.length) {
            appendMetaRow(
                "整题涉及",
                item.knowledgePoints.join("、")
            );
        }

        if (item.mistakeCount > 1) {
            appendMetaRow(
                "错误记录",
                `${item.mistakeCount} 次`
            );
        }

        if (item.retestCount) {
            appendMetaRow(
                "复测情况",
                `${item.retestCount} 次，通过 ${item.retestPassCount} 次`
            );
        }

        const feedback = document.createElement("div");
        feedback.className = "wrong-feedback";

        if (item.feedback) {
            const prefix = item.source === "manual"
                ? "记录说明："
                : "最近反馈：";

            const prefixNode = document.createElement("strong");
            prefixNode.textContent = prefix;

            const feedbackBody = document.createElement("div");
            feedbackBody.className = "wrong-feedback-body";
            feedbackBody.innerHTML = markdownToHtml(item.feedback);

            feedback.appendChild(prefixNode);
            feedback.appendChild(feedbackBody);
        } else {
            feedback.textContent = "还没有记录订正提示。";
        }

        const note = document.createElement("div");
        note.className = "wrong-note";

        if (item.note) {
            const noteTitle = document.createElement("strong");
            noteTitle.textContent = "我的笔记：";

            const noteBody = document.createElement("div");
            noteBody.className = "wrong-note-body";
            noteBody.innerHTML = markdownToHtml(item.note);

            note.appendChild(noteTitle);
            note.appendChild(noteBody);
        }

        const retest = document.createElement("div");
        retest.className = "wrong-retest";

        if (item.lastRetestAt) {
            const resultText = item.lastRetestResult === "correct"
                ? "最近复测：通过"
                : (
                    item.lastRetestResult === "wrong"
                        ? "最近复测：未通过"
                        : "最近复测：尚未确认"
                );

            retest.textContent = resultText;
        }

        const actions = document.createElement("div");
        actions.className = "wrong-actions";

        if (!item.corrected) {
            const correctedButton = document.createElement("button");
            correctedButton.type = "button";
            correctedButton.textContent = "完成订正";
            correctedButton.onclick = () => (
                markWrongQuestionCorrected(item.id)
            );
            actions.appendChild(correctedButton);
        }

        const retestButton = document.createElement("button");
        retestButton.type = "button";
        retestButton.className = item.corrected || item.retestPassed
            ? ""
            : "secondary";
        retestButton.textContent = item.retestPassed
            ? "再测一次"
            : "再测一道";
        retestButton.disabled = !item.corrected && !item.retestPassed;
        retestButton.title = retestButton.disabled
            ? "先完成订正，再进行同知识点复测"
            : "生成一道同知识点、难度相近的新题进行验证";
        retestButton.onclick = () => (
            startWrongQuestionRetest(item.id)
        );
        actions.appendChild(retestButton);

        const hasOriginalSession = (
            item.sessionId !== null
            && sessions.some(
                session => String(session.id) === String(item.sessionId)
            )
        );

        if (hasOriginalSession) {
            const backButton = document.createElement("button");
            backButton.type = "button";
            backButton.className = "secondary";
            backButton.textContent = "回到原题";
            backButton.onclick = () => (
                openWrongQuestionSession(item.id)
            );
            actions.appendChild(backButton);
        }

        const hasRetestSession = (
            item.lastRetestSessionId !== null
            && sessions.some(
                session => String(session.id) === String(item.lastRetestSessionId)
            )
        );

        if (hasRetestSession) {
            const retestHistoryButton = document.createElement("button");
            retestHistoryButton.type = "button";
            retestHistoryButton.className = "secondary";
            retestHistoryButton.textContent = "查看最近复测";
            retestHistoryButton.onclick = () => (
                openWrongRetestSession(item.id)
            );
            actions.appendChild(retestHistoryButton);
        }

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "secondary";
        editButton.textContent = "编辑/笔记";
        editButton.onclick = () => openWrongEdit(item.id);
        actions.appendChild(editButton);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "secondary danger";
        removeButton.textContent = "移出错题本";
        removeButton.onclick = () => (
            removeWrongQuestion(item.id)
        );
        actions.appendChild(removeButton);

        card.appendChild(top);
        card.appendChild(question);

        if (meta.textContent) {
            card.appendChild(meta);
        }

        card.appendChild(feedback);

        if (item.note) {
            card.appendChild(note);
        }

        if (retest.textContent) {
            card.appendChild(retest);
        }

        card.appendChild(actions);
        list.appendChild(card);

        renderMath(question);
        renderMath(feedback);
        renderMath(note);
    }
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
                    apiText: typeof message.apiText === "string"
                        ? message.apiText
                        : undefined,
                    isRetestPrompt: Boolean(message.isRetestPrompt),
                    isRetestAnswer: Boolean(message.isRetestAnswer),
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
                teaching: normalizeTeaching(session.teaching),
                learningQuestion: normalizeLearningQuestion(
                    session.learningQuestion
                ),
                retest: normalizeRetestSession(session.retest)
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
        teaching: null,
        learningQuestion: null,
        retest: null
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
            let content = (
                message.role === "user"
                && typeof message.apiText === "string"
                && message.apiText.trim()
            )
                ? message.apiText
                : message.text;

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

            rollbackRetestAfterRequestFailure(session);

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
            rollbackRetestAfterRequestFailure(session);

            showAssistantMessage(
                session,
                "AI 服务没有返回有效内容，请重新发送。",
                { isError: true }
            );
            return;
        }

        const retestHandled = processWrongQuestionRetestReply(
            session,
            data.reply
        );

        if (!retestHandled) {
            processLearningFromReply(
                session,
                session.teaching,
                data.reply
            );
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

        rollbackRetestAfterRequestFailure(session);

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

    const message = {
        role: "user",
        text
    };

    const retest = normalizeRetestSession(session.retest);

    if (retest && retest.stage === "awaiting_answer") {
        message.apiText = [
            "【错题复测回答】",
            "这是我的答案，请严格检查是否正确。",
            "如果全部正确，请明确说“这次作答正确”；",
            "如果存在任何实质错误，请明确说“这次作答有错误”。",
            "",
            text
        ].join("\n");
        message.isRetestAnswer = true;

        retest.stage = "checking";
        session.retest = retest;
    }

    session.messages.push(message);

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


function uniqueTextList(list, limit = 6) {
    return [
        ...new Set(
            (Array.isArray(list) ? list : [])
                .filter(item => typeof item === "string" && item.trim())
                .map(item => item.trim())
        )
    ].slice(0, limit);
}

function normalizeKnowledgeGraphData(data) {
    if (!data || typeof data !== "object") {
        return null;
    }

    const nodes = Array.isArray(data.nodes)
        ? data.nodes
            .filter(node => node && typeof node === "object")
            .map(node => ({
                id: typeof node.id === "string" && node.id.trim()
                    ? node.id.trim()
                    : "",
                name: typeof node.name === "string" && node.name.trim()
                    ? node.name.trim()
                    : "",
                category: typeof node.category === "string" && node.category.trim()
                    ? node.category.trim()
                    : "未分类",
                prerequisites: uniqueTextList(node.prerequisites, 8)
            }))
            .filter(node => node.id && node.name)
        : [];

    return {
        version: Number.isFinite(data.version)
            ? data.version
            : 1,
        title: typeof data.title === "string" && data.title.trim()
            ? data.title.trim()
            : "离散数学知识图谱",
        description: typeof data.description === "string"
            ? data.description.trim()
            : "",
        nodes
    };
}

async function ensureKnowledgeGraphData() {
    if (knowledgeGraphData) {
        return knowledgeGraphData;
    }

    if (knowledgeGraphLoading) {
        return null;
    }

    knowledgeGraphLoading = true;

    try {
        // 知识图谱直接随前端代码发布，不再依赖额外 HTTP 接口。
        // 这样 Zeabur 反向代理、旧 app.py、缓存等都不会导致图谱加载失败。
        knowledgeGraphData = normalizeKnowledgeGraphData(
            EMBEDDED_KNOWLEDGE_GRAPH
        );

        if (
            !knowledgeGraphData
            || !knowledgeGraphData.nodes.length
        ) {
            throw new Error("知识图谱数据为空。");
        }

        return knowledgeGraphData;
    } catch (error) {
        console.warn("知识图谱加载失败：", error);
        knowledgeGraphData = null;
        throw error;
    } finally {
        knowledgeGraphLoading = false;
    }
}

function getKnowledgeGraphCategories() {
    if (!knowledgeGraphData) return [];

    return [
        ...new Set(
            knowledgeGraphData.nodes.map(
                node => node.category
            )
        )
    ].sort((a, b) => a.localeCompare(
        b,
        "zh-Hans-CN"
    ));
}

function getCurrentKnowledgeContext() {
    const session = getCurrent();
    const teaching = normalizeTeaching(
        session?.teaching
    );
    const learningQuestion = currentLearningQuestion(
        session,
        teaching
    );

    const focusPoints = uniqueTextList([
        ...(teaching?.focus_points || []),
        ...(learningQuestion?.focusPoints || [])
    ], 2);

    const knowledgePoints = uniqueTextList([
        ...(teaching?.knowledge_points || []),
        ...(learningQuestion?.knowledgePoints || [])
    ], 6);

    const prerequisitePoints = uniqueTextList(
        teaching?.prerequisite_points || [],
        6
    );

    const knowledgePath = uniqueTextList(
        teaching?.knowledge_path || [],
        10
    );

    return {
        category: teaching?.category
            || learningQuestion?.category
            || "",
        focusPoints,
        knowledgePoints,
        prerequisitePoints,
        knowledgePath
    };
}

function fillKnowledgeGraphCategoryOptions() {
    const select = document.getElementById(
        "knowledgeGraphCategory"
    );

    if (!select || !knowledgeGraphData) return;

    const categories = getKnowledgeGraphCategories();
    const values = ["全部", ...categories];

    const currentValue = (
        values.includes(knowledgeGraphFilter)
            ? knowledgeGraphFilter
            : "全部"
    );

    select.innerHTML = "";

    for (const value of values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        option.selected = value === currentValue;
        select.appendChild(option);
    }
}

function findKnowledgeGraphNodeById(nodeId) {
    if (
        !knowledgeGraphData
        || !Array.isArray(knowledgeGraphData.nodes)
    ) {
        return null;
    }

    return knowledgeGraphData.nodes.find(
        node => node.id === nodeId
    ) || null;
}

function findKnowledgeGraphNodeByName(name) {
    if (
        !knowledgeGraphData
        || !Array.isArray(knowledgeGraphData.nodes)
    ) {
        return null;
    }

    return knowledgeGraphData.nodes.find(
        node => node.name === name
    ) || null;
}

function ensureKnowledgeGraphSelection(visibleNodes, context) {
    const ids = new Set(
        (Array.isArray(visibleNodes) ? visibleNodes : [])
            .map(node => node.id)
    );

    if (
        knowledgeGraphSelectedNodeId
        && ids.has(knowledgeGraphSelectedNodeId)
    ) {
        return;
    }

    const preferredNames = [
        ...(context?.focusPoints || []),
        ...(context?.knowledgePath || []),
        ...(context?.knowledgePoints || []),
        ...(context?.prerequisitePoints || [])
    ];

    for (const name of preferredNames) {
        const node = (visibleNodes || []).find(
            item => item.name === name
        );

        if (node) {
            knowledgeGraphSelectedNodeId = node.id;
            return;
        }
    }

    knowledgeGraphSelectedNodeId = visibleNodes?.[0]?.id || "";
}

function openKnowledgeGraph() {
    const modal = document.getElementById(
        "knowledgeGraphModal"
    );

    if (!modal) return;

    modal.classList.remove("hidden");
    renderKnowledgeGraphLoading(
        "知识图谱加载中…"
    );

    ensureKnowledgeGraphData()
        .then(() => {
            const context = getCurrentKnowledgeContext();
            const categories = getKnowledgeGraphCategories();

            if (
                context.category
                && categories.includes(context.category)
                && knowledgeGraphFilter === "全部"
            ) {
                knowledgeGraphFilter = context.category;
            }

            fillKnowledgeGraphCategoryOptions();
            renderKnowledgeGraph();
        })
        .catch(() => {
            renderKnowledgeGraphLoading(
                "知识图谱暂时加载失败，请稍后重试。"
            );
        });
}

function closeKnowledgeGraph() {
    const modal = document.getElementById(
        "knowledgeGraphModal"
    );

    if (modal) {
        modal.classList.add("hidden");
    }
}

function renderKnowledgeGraphLoading(message) {
    const summary = document.getElementById(
        "knowledgeGraphSummary"
    );
    const canvas = document.getElementById(
        "knowledgeGraphCanvas"
    );
    const detailTitle = document.getElementById(
        "knowledgeGraphDetailTitle"
    );
    const detail = document.getElementById(
        "knowledgeGraphDetail"
    );

    if (summary) {
        summary.textContent = (
            "这里会把当前题目的知识点、前置知识和学习状态画成可视化图谱。"
        );
    }

    if (canvas) {
        canvas.innerHTML = `<div class="kg-empty">${message}</div>`;
    }

    if (detailTitle) {
        detailTitle.textContent = "节点详情";
    }

    if (detail) {
        detail.textContent = (
            "点击左侧节点后，这里会显示知识点说明、前置知识、后续知识和当前学习状态。"
        );
    }
}

function setKnowledgeGraphFilter(value) {
    knowledgeGraphFilter = String(value || "").trim() || "全部";
    renderKnowledgeGraph();
}

function focusKnowledgeGraphOnCurrent() {
    if (!knowledgeGraphData) return;

    const context = getCurrentKnowledgeContext();
    const categories = getKnowledgeGraphCategories();

    if (
        context.category
        && categories.includes(context.category)
    ) {
        knowledgeGraphFilter = context.category;
    } else {
        const relatedName = (
            context.focusPoints[0]
            || context.knowledgePoints[0]
            || context.prerequisitePoints[0]
            || ""
        );

        const relatedNode = relatedName
            ? findKnowledgeGraphNodeByName(relatedName)
            : null;

        if (relatedNode) {
            knowledgeGraphFilter = relatedNode.category;
        }
    }

    const currentNode = (
        context.focusPoints[0]
        || context.knowledgePoints[0]
        || context.prerequisitePoints[0]
        || ""
    );

    if (currentNode) {
        const node = findKnowledgeGraphNodeByName(
            currentNode
        );

        if (node) {
            knowledgeGraphSelectedNodeId = node.id;
        }
    }

    fillKnowledgeGraphCategoryOptions();
    renderKnowledgeGraph();
}

function knowledgeGraphNodeState(nodeName, context) {
    const record = learningState?.knowledge?.[nodeName];
    const status = knowledgeStatus(record);

    if (context?.focusPoints?.includes(nodeName)) {
        return {
            key: "focus",
            label: "当前卡点",
            fill: "#2563eb",
            stroke: "#93c5fd",
            text: "#ffffff",
            badge: "卡点"
        };
    }

    if (context?.knowledgePoints?.includes(nodeName)) {
        return {
            key: "current",
            label: "当前题目涉及",
            fill: "#6d28d9",
            stroke: "#c4b5fd",
            text: "#ffffff",
            badge: "本题"
        };
    }

    if (context?.prerequisitePoints?.includes(nodeName)) {
        return {
            key: "prerequisite",
            label: "当前前置知识",
            fill: "#0369a1",
            stroke: "#7dd3fc",
            text: "#ffffff",
            badge: "前置"
        };
    }

    if (status === "需要巩固") {
        return {
            key: "review",
            label: "需要巩固",
            fill: "#3f1d1d",
            stroke: "#ef4444",
            text: "#ffffff",
            badge: "巩固"
        };
    }

    if (status === "学习中") {
        return {
            key: "learning",
            label: "学习中",
            fill: "#78350f",
            stroke: "#f59e0b",
            text: "#ffffff",
            badge: "学习中"
        };
    }

    if (status === "比较熟悉") {
        return {
            key: "familiar",
            label: "比较熟悉",
            fill: "#064e3b",
            stroke: "#10b981",
            text: "#ffffff",
            badge: "熟悉"
        };
    }

    if (status === "掌握较稳") {
        return {
            key: "stable",
            label: "掌握较稳",
            fill: "#065f46",
            stroke: "#34d399",
            text: "#ffffff",
            badge: "较稳"
        };
    }

    return {
        key: "none",
        label: "暂无记录",
        fill: "#111827",
        stroke: "#475569",
        text: "#ffffff",
        badge: "未学"
    };
}

function splitKnowledgeGraphLabel(text, maxChars = 7) {
    const value = String(text || "").trim();

    if (!value) return [""];

    const lines = [];

    for (let index = 0; index < value.length; index += maxChars) {
        lines.push(
            value.slice(index, index + maxChars)
        );
    }

    return lines.slice(0, 2);
}

function createSvgElement(tag, attrs = {}) {
    const element = document.createElementNS(
        "http://www.w3.org/2000/svg",
        tag
    );

    for (const [key, value] of Object.entries(attrs)) {
        if (
            value !== undefined
            && value !== null
        ) {
            element.setAttribute(
                key,
                String(value)
            );
        }
    }

    return element;
}

function knowledgeGraphVisibleNodes(category) {
    if (!knowledgeGraphData) return [];

    const allNodes = knowledgeGraphData.nodes;

    if (!category || category === "全部") {
        return allNodes.slice();
    }

    return allNodes.filter(
        node => node.category === category
    );
}

function computeKnowledgeGraphLevels(nodes) {
    const byName = new Map(
        nodes.map(node => [node.name, node])
    );
    const memo = new Map();
    const visiting = new Set();

    function depth(node) {
        if (memo.has(node.id)) {
            return memo.get(node.id);
        }

        if (visiting.has(node.id)) {
            return 0;
        }

        visiting.add(node.id);

        let value = 0;

        for (const prerequisite of node.prerequisites) {
            const previous = byName.get(prerequisite);

            if (previous) {
                value = Math.max(
                    value,
                    depth(previous) + 1
                );
            }
        }

        visiting.delete(node.id);
        memo.set(node.id, value);

        return value;
    }

    for (const node of nodes) {
        depth(node);
    }

    return memo;
}

function renderKnowledgeGraphSection(container, nodes, title, description, context) {
    const section = document.createElement("div");
    section.className = "kg-section";

    const heading = document.createElement("div");
    heading.className = "kg-section-title";
    heading.textContent = title;
    section.appendChild(heading);

    if (description) {
        const desc = document.createElement("div");
        desc.className = "kg-section-desc";
        desc.textContent = description;
        section.appendChild(desc);
    }

    if (!nodes.length) {
        const empty = document.createElement("div");
        empty.className = "kg-empty";
        empty.textContent = "这个分类下暂时没有可显示的节点。";
        section.appendChild(empty);
        container.appendChild(section);
        return;
    }

    const levels = computeKnowledgeGraphLevels(nodes);
    const orderedNodes = nodes.slice();
    const orderMap = new Map(
        orderedNodes.map(
            (node, index) => [node.id, index]
        )
    );

    const columns = new Map();

    for (const node of orderedNodes) {
        const level = levels.get(node.id) || 0;
        if (!columns.has(level)) {
            columns.set(level, []);
        }
        columns.get(level).push(node);
    }

    const columnKeys = [...columns.keys()].sort((a, b) => a - b);

    for (const key of columnKeys) {
        columns.get(key).sort(
            (a, b) => (
                orderMap.get(a.id)
                - orderMap.get(b.id)
            )
        );
    }

    const nodeWidth = 132;
    const nodeHeight = 58;
    const horizontalGap = 74;
    const verticalGap = 26;
    const margin = 24;

    const maxRows = Math.max(
        ...columnKeys.map(
            key => columns.get(key).length
        ),
        1
    );

    const svgWidth = (
        margin * 2
        + columnKeys.length * nodeWidth
        + Math.max(columnKeys.length - 1, 0) * horizontalGap
    );

    const svgHeight = (
        margin * 2
        + maxRows * nodeHeight
        + Math.max(maxRows - 1, 0) * verticalGap
    );

    const svg = createSvgElement("svg", {
        class: "kg-svg",
        viewBox: `0 0 ${svgWidth} ${svgHeight}`
    });

    const positions = new Map();

    for (let columnIndex = 0; columnIndex < columnKeys.length; columnIndex += 1) {
        const level = columnKeys[columnIndex];
        const group = columns.get(level);
        const x = margin + columnIndex * (nodeWidth + horizontalGap);
        const totalHeight = (
            group.length * nodeHeight
            + Math.max(group.length - 1, 0) * verticalGap
        );
        const startY = margin + (svgHeight - margin * 2 - totalHeight) / 2;

        for (let rowIndex = 0; rowIndex < group.length; rowIndex += 1) {
            const node = group[rowIndex];
            const y = startY + rowIndex * (nodeHeight + verticalGap);
            positions.set(node.id, { x, y });
        }
    }

    const byName = new Map(
        nodes.map(node => [node.name, node])
    );

    for (const node of orderedNodes) {
        const current = positions.get(node.id);

        if (!current) continue;

        for (const prerequisiteName of node.prerequisites) {
            const previousNode = byName.get(prerequisiteName);

            if (!previousNode) continue;

            const previous = positions.get(previousNode.id);

            if (!previous) continue;

            const x1 = previous.x + nodeWidth;
            const y1 = previous.y + nodeHeight / 2;
            const x2 = current.x;
            const y2 = current.y + nodeHeight / 2;
            const midX = (x1 + x2) / 2;

            const path = createSvgElement("path", {
                class: "kg-edge",
                d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
            });

            svg.appendChild(path);
        }
    }

    for (const node of orderedNodes) {
        const position = positions.get(node.id);

        if (!position) continue;

        const state = knowledgeGraphNodeState(
            node.name,
            context
        );
        const group = createSvgElement("g", {
            class: (
                "kg-node-group"
                + (node.id === knowledgeGraphSelectedNodeId ? " selected" : "")
            ),
            transform: `translate(${position.x}, ${position.y})`
        });

        group.addEventListener(
            "click",
            () => {
                knowledgeGraphSelectedNodeId = node.id;
                renderKnowledgeGraphDetail();
                renderKnowledgeGraph();
            }
        );

        const rect = createSvgElement("rect", {
            x: 0,
            y: 0,
            width: nodeWidth,
            height: nodeHeight,
            rx: 12,
            fill: state.fill,
            stroke: state.stroke,
            "stroke-width": node.id === knowledgeGraphSelectedNodeId ? 3 : 2
        });

        group.appendChild(rect);

        const lines = splitKnowledgeGraphLabel(
            node.name
        );
        const text = createSvgElement("text", {
            class: "kg-node-label",
            x: nodeWidth / 2,
            y: 22,
            "text-anchor": "middle"
        });

        if (lines.length === 1) {
            const tspan = createSvgElement("tspan", {
                x: nodeWidth / 2,
                dy: 0
            });
            tspan.textContent = lines[0];
            text.appendChild(tspan);
        } else {
            lines.forEach((line, index) => {
                const tspan = createSvgElement("tspan", {
                    x: nodeWidth / 2,
                    dy: index === 0 ? 0 : 14
                });
                tspan.textContent = line;
                text.appendChild(tspan);
            });
        }

        group.appendChild(text);

        const badge = createSvgElement("text", {
            class: "kg-node-badge",
            x: nodeWidth / 2,
            y: nodeHeight - 10,
            "text-anchor": "middle"
        });
        badge.textContent = state.badge;
        group.appendChild(badge);

        svg.appendChild(group);
    }

    section.appendChild(svg);
    container.appendChild(section);
}

function renderKnowledgeGraphSummary(context) {
    const summary = document.getElementById(
        "knowledgeGraphSummary"
    );

    if (!summary) return;

    const lines = [];

    lines.push(
        "说明：点击图中的知识点，可以查看它的前置知识、后续知识和你当前的学习状态。"
    );

    if (context.category) {
        lines.push(
            `当前题目所属模块：${context.category}`
        );
    }

    if (context.focusPoints.length) {
        lines.push(
            `这次主要卡在：${context.focusPoints.join("、")}`
        );
    }

    if (context.knowledgePoints.length) {
        lines.push(
            `整题涉及：${context.knowledgePoints.join("、")}`
        );
    }

    if (context.prerequisitePoints.length) {
        lines.push(
            `做这题前最好会：${context.prerequisitePoints.join("、")}`
        );
    }

    if (context.knowledgePath.length >= 2) {
        lines.push(
            `知识脉络：${context.knowledgePath.join(" → ")}`
        );
    }

    summary.textContent = lines.join("\n");
}

function renderKnowledgeGraphDetail() {
    const title = document.getElementById(
        "knowledgeGraphDetailTitle"
    );
    const detail = document.getElementById(
        "knowledgeGraphDetail"
    );

    if (!title || !detail || !knowledgeGraphData) return;

    const node = findKnowledgeGraphNodeById(
        knowledgeGraphSelectedNodeId
    );

    if (!node) {
        title.textContent = "节点详情";
        detail.textContent = (
            "点击左侧节点后，这里会显示知识点说明、前置知识、后续知识和当前学习状态。"
        );
        return;
    }

    const context = getCurrentKnowledgeContext();
    const state = knowledgeGraphNodeState(
        node.name,
        context
    );
    const record = learningState?.knowledge?.[node.name] || null;
    const nextNodes = knowledgeGraphData.nodes
        .filter(item => item.prerequisites.includes(node.name))
        .map(item => item.name);

    title.textContent = node.name;
    detail.innerHTML = "";

    const categoryLabel = document.createElement("span");
    categoryLabel.className = "detail-label";
    categoryLabel.textContent = "所属模块";
    detail.appendChild(categoryLabel);

    const categoryText = document.createElement("div");
    categoryText.textContent = node.category;
    detail.appendChild(categoryText);

    const pill = document.createElement("span");
    pill.className = `graph-status-pill ${state.key}`;
    pill.textContent = state.label;
    detail.appendChild(pill);

    const prerequisiteLabel = document.createElement("span");
    prerequisiteLabel.className = "detail-label";
    prerequisiteLabel.textContent = "前置知识";
    detail.appendChild(prerequisiteLabel);

    const prerequisiteText = document.createElement("div");
    prerequisiteText.textContent = node.prerequisites.length
        ? node.prerequisites.join("、")
        : "这个知识点已经是当前模块里的起点。";
    detail.appendChild(prerequisiteText);

    const nextLabel = document.createElement("span");
    nextLabel.className = "detail-label";
    nextLabel.textContent = "后续知识";
    detail.appendChild(nextLabel);

    const nextText = document.createElement("div");
    nextText.textContent = nextNodes.length
        ? nextNodes.join("、")
        : "目前没有记录到更靠后的直接知识点。";
    detail.appendChild(nextText);

    const relationLabel = document.createElement("span");
    relationLabel.className = "detail-label";
    relationLabel.textContent = "与当前题目的关系";
    detail.appendChild(relationLabel);

    const relationText = document.createElement("div");
    const relations = [];

    if (context.focusPoints.includes(node.name)) {
        relations.push("这是你这次主要卡住的知识点。");
    }

    if (context.knowledgePoints.includes(node.name)) {
        relations.push("它属于当前这道题涉及的核心知识点。");
    }

    if (context.prerequisitePoints.includes(node.name)) {
        relations.push("它是当前题目前最好先掌握的前置知识。");
    }

    if (!relations.length) {
        relations.push("当前题目没有直接强调这个知识点，但你可以顺着图谱查看它和其它知识点的关系。");
    }

    relationText.textContent = relations.join(" ");
    detail.appendChild(relationText);

    const learningLabel = document.createElement("span");
    learningLabel.className = "detail-label";
    learningLabel.textContent = "学习记录";
    detail.appendChild(learningLabel);

    const learningText = document.createElement("div");

    if (!record) {
        learningText.textContent = "目前还没有这个知识点的学习记录。";
    } else {
        learningText.textContent = [
            `当前状态：${knowledgeStatus(record)}`,
            `看过 ${record.seen || 0} 次`,
            `答对 ${record.correct || 0} 次`,
            `答错 ${record.wrong || 0} 次`,
            `获得提示 ${record.support || 0} 次`,
            `完成订正 ${record.reviewed || 0} 次`
        ].join("，");
    }

    detail.appendChild(learningText);
}

function renderKnowledgeGraph() {
    const modal = document.getElementById(
        "knowledgeGraphModal"
    );

    if (!modal || modal.classList.contains("hidden")) {
        return;
    }

    if (!knowledgeGraphData) {
        renderKnowledgeGraphLoading(
            "知识图谱加载中…"
        );
        return;
    }

    fillKnowledgeGraphCategoryOptions();

    const context = getCurrentKnowledgeContext();
    const canvas = document.getElementById(
        "knowledgeGraphCanvas"
    );

    if (!canvas) return;

    renderKnowledgeGraphSummary(context);
    canvas.innerHTML = "";

    if (!knowledgeGraphData.nodes.length) {
        canvas.innerHTML = (
            '<div class="kg-empty">知识图谱目前还是空的。</div>'
        );
        renderKnowledgeGraphDetail();
        return;
    }

    if (knowledgeGraphFilter === "全部") {
        const visibleNodes = knowledgeGraphVisibleNodes(
            "全部"
        );
        ensureKnowledgeGraphSelection(
            visibleNodes,
            context
        );

        const categories = getKnowledgeGraphCategories();

        for (const category of categories) {
            const categoryNodes = knowledgeGraphVisibleNodes(
                category
            );

            renderKnowledgeGraphSection(
                canvas,
                categoryNodes,
                category,
                category === context.category
                    ? "这是当前题目所在的模块。"
                    : "",
                context
            );
        }
    } else {
        const visibleNodes = knowledgeGraphVisibleNodes(
            knowledgeGraphFilter
        );
        ensureKnowledgeGraphSelection(
            visibleNodes,
            context
        );

        renderKnowledgeGraphSection(
            canvas,
            visibleNodes,
            knowledgeGraphFilter,
            knowledgeGraphFilter === context.category
                ? "这是当前题目所在的模块。"
                : "",
            context
        );
    }

    renderKnowledgeGraphDetail();
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

        if (teaching.focus_points.length) {
            lines.push(
                `这次主要在看：${teaching.focus_points.join("、")}`
            );
        }

        if (teaching.knowledge_points.length) {
            lines.push(
                `整道题涉及：${teaching.knowledge_points.join("、")}`
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
    renderLearningSummary();
    renderKnowledgeGraph();
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
        const markWrongBtn = document.getElementById("markWrongBtn");
        const wrongBookBtn = document.getElementById("wrongBookBtn");
        const wrongBookClose = document.getElementById("wrongBookClose");
        const wrongBookModal = document.getElementById("wrongBookModal");
        const wrongBookSearchBox = document.getElementById("wrongBookSearch");
        const wrongBookSortBox = document.getElementById("wrongBookSort");
        const wrongPdfBtn = document.getElementById("wrongPdfBtn");
        const wrongClearCompletedBtn = document.getElementById("wrongClearCompletedBtn");
        const wrongEditClose = document.getElementById("wrongEditClose");
        const wrongEditCancel = document.getElementById("wrongEditCancel");
        const wrongEditSave = document.getElementById("wrongEditSave");
        const wrongEditModal = document.getElementById("wrongEditModal");
        const knowledgeGraphBtn = document.getElementById("knowledgeGraphBtn");
        const knowledgeGraphClose = document.getElementById("knowledgeGraphClose");
        const knowledgeGraphModal = document.getElementById("knowledgeGraphModal");
        const knowledgeGraphCategory = document.getElementById("knowledgeGraphCategory");
        const knowledgeGraphFocusBtn = document.getElementById("knowledgeGraphFocusBtn");
        const wrongFilterButtons = document.querySelectorAll(
            "[data-wrong-filter]"
        );

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

        if (markWrongBtn) {
            markWrongBtn.addEventListener(
                "click",
                manualMarkCurrentWrong
            );
        }

        if (wrongBookBtn) {
            wrongBookBtn.addEventListener(
                "click",
                openWrongBook
            );
        }

        if (wrongBookClose) {
            wrongBookClose.addEventListener(
                "click",
                closeWrongBook
            );
        }

        if (wrongBookModal) {
            wrongBookModal.addEventListener(
                "click",
                event => {
                    if (event.target === wrongBookModal) {
                        closeWrongBook();
                    }
                }
            );
        }

        if (wrongBookSearchBox) {
            wrongBookSearchBox.addEventListener(
                "input",
                event => setWrongBookSearch(event.target.value)
            );
        }

        if (wrongBookSortBox) {
            wrongBookSortBox.addEventListener(
                "change",
                event => setWrongBookSort(event.target.value)
            );
        }

        if (wrongPdfBtn) {
            wrongPdfBtn.addEventListener(
                "click",
                exportWrongBookPdf
            );
        }

        if (wrongClearCompletedBtn) {
            wrongClearCompletedBtn.addEventListener(
                "click",
                clearCompletedWrongQuestions
            );
        }

        if (wrongEditClose) {
            wrongEditClose.addEventListener(
                "click",
                closeWrongEdit
            );
        }

        if (wrongEditCancel) {
            wrongEditCancel.addEventListener(
                "click",
                closeWrongEdit
            );
        }

        if (wrongEditSave) {
            wrongEditSave.addEventListener(
                "click",
                saveWrongEdit
            );
        }

        if (wrongEditModal) {
            wrongEditModal.addEventListener(
                "click",
                event => {
                    if (event.target === wrongEditModal) {
                        closeWrongEdit();
                    }
                }
            );
        }

        if (knowledgeGraphBtn) {
            knowledgeGraphBtn.addEventListener(
                "click",
                openKnowledgeGraph
            );
        }

        if (knowledgeGraphClose) {
            knowledgeGraphClose.addEventListener(
                "click",
                closeKnowledgeGraph
            );
        }

        if (knowledgeGraphModal) {
            knowledgeGraphModal.addEventListener(
                "click",
                event => {
                    if (event.target === knowledgeGraphModal) {
                        closeKnowledgeGraph();
                    }
                }
            );
        }

        if (knowledgeGraphCategory) {
            knowledgeGraphCategory.addEventListener(
                "change",
                event => setKnowledgeGraphFilter(event.target.value)
            );
        }

        if (knowledgeGraphFocusBtn) {
            knowledgeGraphFocusBtn.addEventListener(
                "click",
                focusKnowledgeGraphOnCurrent
            );
        }

        for (const button of wrongFilterButtons) {
            button.addEventListener(
                "click",
                () => {
                    setWrongBookFilter(
                        button.getAttribute("data-wrong-filter")
                    );
                }
            );
        }

        loadLearningState();

        const restored = loadState();

        if (!restored) {
            const id = makeSessionId();

            sessions.push({
                id,
                name: "新对话",
                messages: [],
                teaching: null,
                learningQuestion: null,
                retest: null
            });

            currentId = id;
            saveState();
        }

        renderAll();
        enableInput(true);
    }
);
