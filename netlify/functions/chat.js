const { google } = require("googleapis");
const OpenAI = require("openai");
const pdfParse = require("pdf-parse");

const MODEL = "gpt-4o-mini";
const MAX_DOC_CHARS = 80000;

let driveClientCache = null;
const docsCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function normalizePrivateKey(key) {
  if (!key) return key;
  let k = key.trim();
  // 따옴표로 감싸진 채로 붙여넣어졌으면 제거
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  // \n 문자열을 실제 개행으로 변환 (한 줄 형태로 붙여넣었을 때)
  k = k.replace(/\\n/g, "\n");
  return k;
}

function getServiceAccountCredentials() {
  // 방식 1 (권장): client_email + private_key 두 환경변수로 분리
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (email && key) {
    return {
      client_email: email.trim(),
      private_key: normalizePrivateKey(key),
    };
  }

  // 방식 2: base64 인코딩한 JSON
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    try {
      const decoded = Buffer.from(b64.trim(), "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch (e) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_BASE64 값을 디코딩하지 못했습니다. base64로 변환된 값이 맞는지 확인하세요.");
    }
  }

  // 방식 3 (폴백): 원본 JSON 통째로
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    let jsonString = raw.trim();
    if (!jsonString.startsWith("{")) {
      try {
        jsonString = Buffer.from(jsonString, "base64").toString("utf8");
      } catch (_) {
        // 그냥 진행해서 아래에서 에러 발생시키도록
      }
    }
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.private_key) {
        parsed.private_key = normalizePrivateKey(parsed.private_key);
      }
      return parsed;
    } catch (e) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON 값을 JSON으로 읽을 수 없습니다. " +
        "더 쉬운 방법으로, GOOGLE_CLIENT_EMAIL과 GOOGLE_PRIVATE_KEY를 따로 등록해보세요. (README 참고)"
      );
    }
  }

  throw new Error(
    "구글 서비스 계정 환경변수가 없습니다. Netlify에 GOOGLE_CLIENT_EMAIL과 GOOGLE_PRIVATE_KEY를 등록해주세요. (README 5단계 참고)"
  );
}

function getDriveClient() {
  if (driveClientCache) return driveClientCache;
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  driveClientCache = google.drive({ version: "v3", auth });
  return driveClientCache;
}

async function listFolderFiles(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

async function fetchFileText(drive, file) {
  const { id, name, mimeType } = file;

  if (mimeType === "application/vnd.google-apps.document") {
    const res = await drive.files.export(
      { fileId: id, mimeType: "text/plain" },
      { responseType: "text" }
    );
    return res.data;
  }

  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    const res = await drive.files.export(
      { fileId: id, mimeType: "text/csv" },
      { responseType: "text" }
    );
    return res.data;
  }

  if (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    mimeType === "text/csv" ||
    name.endsWith(".md") ||
    name.endsWith(".txt")
  ) {
    const res = await drive.files.get(
      { fileId: id, alt: "media" },
      { responseType: "text" }
    );
    return typeof res.data === "string" ? res.data : String(res.data);
  }

  if (mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    const res = await drive.files.get(
      { fileId: id, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const buffer = Buffer.from(res.data);
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }

  return null;
}

async function loadFolderDocuments(folderId) {
  const cached = docsCache.get(folderId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const drive = getDriveClient();
  const files = await listFolderFiles(drive, folderId);

  const docs = [];
  const skipped = [];
  for (const file of files) {
    try {
      const text = await fetchFileText(drive, file);
      if (text == null) {
        skipped.push(`${file.name} (지원하지 않는 형식: ${file.mimeType})`);
        continue;
      }
      const trimmed = text.trim();
      if (trimmed) {
        docs.push({ name: file.name, text: trimmed });
      }
    } catch (e) {
      skipped.push(`${file.name} (읽기 실패: ${e.message})`);
    }
  }

  const result = { docs, skipped, fileCount: files.length };
  docsCache.set(folderId, { at: Date.now(), value: result });
  return result;
}

function buildContext(docs) {
  let total = 0;
  const parts = [];
  let truncated = false;
  for (const doc of docs) {
    const header = `\n\n===== 문서: ${doc.name} =====\n`;
    const remaining = MAX_DOC_CHARS - total;
    if (remaining <= header.length) {
      truncated = true;
      break;
    }
    let body = doc.text;
    if (body.length > remaining - header.length) {
      body = body.slice(0, remaining - header.length);
      truncated = true;
    }
    parts.push(header + body);
    total += header.length + body.length;
    if (truncated) break;
  }
  return { contextText: parts.join(""), truncated };
}

function buildSystemPrompt(userInstructions, contextText, truncated) {
  const baseInstructions = (userInstructions || "").trim() ||
    "당신은 친절하고 귀여운 학습 도우미 챗봇입니다. 사용자의 질문에 정확하고 따뜻한 말투로 답해주세요.";

  const docsSection = contextText
    ? `\n\n# 참조 문서\n아래는 답변에 활용해야 하는 참고 문서입니다. 답을 모르거나 문서에 없는 내용은 추측하지 말고 모른다고 말해주세요.${truncated ? "\n(주의: 문서 분량이 많아 일부만 포함되었습니다.)" : ""}\n${contextText}`
    : "\n\n(현재 연결된 참조 문서가 없습니다. 일반 지식으로 답변하세요.)";

  return baseInstructions + docsSection;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "POST만 허용됩니다." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return jsonResponse(400, { error: "요청 본문이 올바른 JSON이 아닙니다." });
  }

  const { messages, instructions, folderId } = payload;

  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse(400, { error: "messages 배열이 비어있습니다." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonResponse(500, { error: "OPENAI_API_KEY 환경변수가 설정되지 않았습니다. Netlify 사이트 설정에서 등록해주세요." });
  }

  let contextResult = { docs: [], skipped: [], fileCount: 0 };
  if (folderId && folderId.trim()) {
    try {
      contextResult = await loadFolderDocuments(folderId.trim());
    } catch (e) {
      return jsonResponse(500, {
        error: `Google Drive 폴더를 읽지 못했습니다: ${e.message}\n\n폴더 ID가 맞는지, 서비스 계정 이메일에 폴더가 편집자(또는 뷰어) 권한으로 공유되었는지 확인하세요.`,
      });
    }
  }

  const { contextText, truncated } = buildContext(contextResult.docs);
  const systemPrompt = buildSystemPrompt(instructions, contextText, truncated);

  const sanitizedMessages = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content }));

  if (sanitizedMessages.length === 0) {
    return jsonResponse(400, { error: "유효한 메시지가 없습니다." });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...sanitizedMessages],
      temperature: 0.7,
    });

    const reply = completion.choices?.[0]?.message?.content || "(응답이 비어있습니다.)";

    return jsonResponse(200, {
      reply,
      meta: {
        docsUsed: contextResult.docs.map((d) => d.name),
        docsSkipped: contextResult.skipped,
        totalFilesInFolder: contextResult.fileCount,
        truncated,
        model: MODEL,
      },
    });
  } catch (e) {
    const message = e?.response?.data?.error?.message || e.message || String(e);
    return jsonResponse(500, { error: `OpenAI 호출 실패: ${message}` });
  }
};
