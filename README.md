# 🐰 나만의 문서 챗봇 만들기

OpenAI + Google Drive를 연동해, 내가 올린 문서를 참고해서 답해주는 **나만의 챗봇 웹앱**을 만드는 실습입니다.

여러분이 직접 바꿀 부분은 딱 두 가지예요:

1. 챗봇의 **응답 지침** (말투, 역할 등) — 웹앱 화면에서 설정
2. 구글 드라이브 폴더에 업로드하는 **참조 문서들**

코드를 직접 수정할 필요는 없습니다! 차근차근 따라와주세요. ✨

---

## 📦 준비물

- 구글 계정 (Google Drive, Google Cloud 사용)
- [OpenAI](https://platform.openai.com/) 계정과 API 키
- [Netlify](https://www.netlify.com/) 계정 (구글 로그인 가능)
- [GitHub](https://github.com/) 계정 (선택 — Netlify에 코드 업로드용. drag & drop으로도 배포 가능)

---

## 🛠️ 1단계 — Google Cloud에서 Drive API 켜기

1. [Google Cloud Console](https://console.cloud.google.com/) 접속 → 새 프로젝트 만들기 (이름 예: `chatbot-lesson`)
2. 왼쪽 메뉴 → **API 및 서비스 → 라이브러리** → "Google Drive API" 검색 → **사용 설정**

## 🔑 2단계 — 서비스 계정 만들기

1. **API 및 서비스 → 사용자 인증 정보** → 위쪽 **"+ 사용자 인증 정보 만들기" → 서비스 계정**
2. 이름 적당히 (예: `chatbot-reader`) → **만들고 계속하기** → 역할은 비워둬도 OK → **완료**
3. 만들어진 서비스 계정 클릭 → **키** 탭 → **키 추가 → 새 키 만들기 → JSON** 선택 → 키 파일이 다운로드됩니다 ⚠️ **이 파일을 잃어버리지 마세요. 비밀번호처럼 다뤄주세요.**
4. 서비스 계정의 **이메일 주소**를 메모해두세요. (예: `chatbot-reader@chatbot-lesson.iam.gserviceaccount.com`)

## 📁 3단계 — Drive 폴더 만들고 공유하기

1. [Google Drive](https://drive.google.com/) 에서 새 폴더 생성 (예: `챗봇 참조 문서`)
2. 폴더 우클릭 → **공유** → 위에서 메모한 **서비스 계정 이메일** 입력 → **편집자(또는 뷰어)** 권한으로 추가
3. 폴더에 들어간 뒤, 주소창의 URL에서 **폴더 ID**를 메모해두세요.
   - URL이 `https://drive.google.com/drive/folders/1AbCdEf...` 라면 `1AbCdEf...` 부분이 폴더 ID
4. 챗봇이 참고할 문서들을 폴더에 업로드하세요. 지원 형식:
   - **Google 문서** (Google Docs) ✅
   - **Google 스프레드시트** (CSV로 변환됨) ✅
   - **PDF** ✅
   - **텍스트 파일** (`.txt`, `.md`) ✅

> 💡 문서가 너무 길면 일부만 사용됩니다. (총 8만 글자 정도까지) 짧고 명확한 문서가 좋아요.

---

## 🚀 4단계 — Netlify에 배포하기

### 방법 A. Drag & Drop (가장 쉬움, 추천)

1. [Netlify](https://app.netlify.com/) 로그인 → 사이트 목록 페이지 아래쪽의 **"deploy manually"** 영역에 이 프로젝트 폴더를 통째로 끌어다 놓으세요.
2. 사이트 URL이 자동 생성됩니다 (예: `https://random-name-123.netlify.app`)

### 방법 B. GitHub 연결

1. GitHub에 새 저장소 만들고 이 폴더의 파일들을 push
2. Netlify → "Add new site" → "Import an existing project" → GitHub 선택 → 저장소 고르기 → Deploy

---

## 🔐 5단계 — Netlify 환경변수 등록

배포된 사이트의 **Site configuration → Environment variables**에서 환경변수를 추가하세요.

### ① `OPENAI_API_KEY`
[OpenAI 대시보드](https://platform.openai.com/api-keys)에서 발급받은 API 키 (`sk-...` 로 시작)

### ② 구글 서비스 계정 정보 (가장 쉬운 방법 ✨)

**JSON 파일 통째로 넣지 마세요!** 헷갈려요. 대신 JSON 파일 안의 두 값만 따로 환경변수로 등록합니다.

2단계에서 다운로드한 JSON 파일을 **메모장**으로 열면 이런 모양입니다:

```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEv...아주 긴 문자열...\n-----END PRIVATE KEY-----\n",
  "client_email": "chatbot-reader@xxx.iam.gserviceaccount.com",
  ...
}
```

여기서 두 값만 복사해서 환경변수로 등록하면 됩니다:

#### `GOOGLE_CLIENT_EMAIL`
- `"client_email":` 다음에 있는 이메일 주소
- 예: `chatbot-reader@chatbot-lesson.iam.gserviceaccount.com`
- 👉 **앞뒤 큰따옴표는 빼고** 이메일 주소만 복사해서 붙여넣기

#### `GOOGLE_PRIVATE_KEY`
- `"private_key":` 다음에 있는 긴 값 (`-----BEGIN PRIVATE KEY-----` 부터 `-----END PRIVATE KEY-----\n` 까지)
- 👉 **앞뒤 큰따옴표는 빼고**, **그 안의 내용 전체**를 그대로 복사해서 붙여넣기
- `\n` 같은 글자가 보여도 그대로 두고 복사하세요. 코드가 알아서 처리해요!

> 💡 **팁**: 메모장에서 키 값 복사할 때, 시작하는 큰따옴표(`"`) 바로 다음 글자부터 끝나는 큰따옴표 바로 앞 글자까지 드래그해서 복사하면 됩니다.

환경변수 4개 등록이 끝났으면, **반드시 다시 배포(Redeploy)** 하세요.
(Netlify → Deploys → Trigger deploy → Deploy site)

---

<details>
<summary>🔧 (참고) 다른 방법: JSON 통째로 또는 base64로 넣기</summary>

위 방법이 가장 쉽지만, 다른 방식도 지원합니다:

- **`GOOGLE_SERVICE_ACCOUNT_BASE64`** : JSON 파일을 base64로 인코딩한 한 줄 문자열
  - PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("키파일경로.json"))`
  - Mac/Linux: `base64 -i 키파일.json`
- **`GOOGLE_SERVICE_ACCOUNT_JSON`** : JSON 파일 내용 통째로 (줄바꿈 처리 때문에 실패하기 쉬움 — 비추)

코드는 이 순서로 환경변수를 찾아 사용합니다:
`GOOGLE_CLIENT_EMAIL`+`GOOGLE_PRIVATE_KEY` → `GOOGLE_SERVICE_ACCOUNT_BASE64` → `GOOGLE_SERVICE_ACCOUNT_JSON`

</details>

---

## 💬 6단계 — 챗봇 사용하기

1. 배포된 사이트 URL 접속
2. 화면 오른쪽 위 **⚙️ 지침 설정** 클릭 → 챗봇이 어떤 말투/역할로 답할지 적기 → 저장
   ```
   예) 당신은 친절한 역사 선생님이에요. 항상 쉬운 말로 설명해주고,
       문서에 없는 내용은 "잘 모르겠어요" 라고 답해주세요.
   ```
3. **📁 폴더 설정** 클릭 → 3단계에서 메모한 **폴더 ID** (또는 폴더 URL 통째로) 붙여넣기 → 저장
4. 채팅창에 질문을 입력 → 챗봇이 폴더 안 문서를 참고해서 답해줍니다! 🎉

### 📱 디바이스 간 자동 동기화

저장한 **지침과 폴더 ID는 Netlify 서버(Netlify Blobs)에도 자동 저장**됩니다.
PC에서 한 번만 설정하면 모바일에서 같은 사이트 URL로 접속할 때 자동으로 불러와요. ☁️
저장 시 토스트 메시지가 `(모든 디바이스에 동기화) ☁️`로 뜨면 성공입니다.

> 🔒 **알아두기**: 사이트 URL을 아는 사람은 누구나 지침을 보고 바꿀 수 있어요. 본인 사이트 URL은 친구한테만 공유하거나 비밀로 유지하세요.

---

## 🧰 로컬에서 미리 보기 (선택)

코드를 수정하면서 테스트하고 싶다면:

```bash
npm install
npx netlify dev
```

`.env.example`을 복사해 `.env` 파일을 만들고 OPENAI_API_KEY와 GOOGLE_SERVICE_ACCOUNT_JSON을 채워넣으세요.

---

## ❓ 문제가 생기면

| 증상 | 확인할 것 |
|---|---|
| `OPENAI_API_KEY 환경변수가 설정되지 않았습니다` | Netlify에 환경변수 등록 후 **재배포** 했는지 확인 |
| `구글 서비스 계정 환경변수가 없습니다` | `GOOGLE_CLIENT_EMAIL`과 `GOOGLE_PRIVATE_KEY` 둘 다 등록했는지 확인 |
| `Google Drive 폴더를 읽지 못했습니다` | 폴더가 **서비스 계정 이메일에 공유**되어 있는지, 폴더 ID가 맞는지, `GOOGLE_PRIVATE_KEY` 값에 `-----BEGIN PRIVATE KEY-----`부터 `-----END PRIVATE KEY-----`까지 다 들어있는지 확인 |
| `참조한 문서가 없어요` 표시 | 폴더가 비어있거나 지원하지 않는 형식만 들어있음 |
| PDF가 안 읽힘 | 스캔 이미지 PDF는 텍스트 추출 불가. 텍스트가 있는 PDF만 가능 |
| 응답이 이상함 | ⚙️ 지침을 더 구체적으로 적어보세요 |

---

## 📂 폴더 구조

```
chatbotlesson/
├── public/                  # 학생이 보는 화면 (변경 불필요)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── netlify/
│   └── functions/
│       └── chat.js          # 서버 로직 (변경 불필요)
├── netlify.toml             # Netlify 설정
├── package.json
└── README.md                # 이 파일
```

---

행운을 빌어요! 🍀 멋진 챗봇 만들어보세요!
