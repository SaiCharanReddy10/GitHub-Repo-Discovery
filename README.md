# GitHub Repo Discovery

A small full-stack app for discovering GitHub repositories, saving useful projects, comparing them, viewing star history, and getting simple local-LLM analysis.

## Stack

FastAPI, React, PostgreSQL, SQLAlchemy, GitHub REST API, Ollama, Docker

## Features

- Search repositories by text, language, topic, and sort order
- View repository metadata, topics, languages, and README content
- Bookmark repositories in PostgreSQL
- Compare up to four bookmarked repositories
- Fetch weekly GitHub star history and store a local star snapshot
- Generate repository summaries and search ideas with local Qwen

GitHub's public REST API supports repository search, README retrieval, and a repository star-history endpoint. A GitHub token is optional for public repositories, but authentication gives a higher API rate limit.

## Run with Docker

1. Copy `.env.example` from `backend/` to `.env` at the project root if you want a GitHub token or custom Ollama settings.
2. Make sure Ollama is running on the host and `qwen2.5:3b` is available.
3. Run:

```bash
docker compose up --build
```

Open `http://localhost:5173`.

## Run without Docker

Start PostgreSQL, create a database named `github_discovery`, then set:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/github_discovery
GITHUB_TOKEN=
OLLAMA_URL=http://localhost:11434
QWEN_MODEL=qwen2.5:3b
```

Backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```
