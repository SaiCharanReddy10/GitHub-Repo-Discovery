import base64
import os
from datetime import datetime
from typing import Any
import httpx
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session
from .db import Base, engine, get_db
from .models import Bookmark, StarSnapshot

Base.metadata.create_all(bind=engine)

app = FastAPI(title="GitHub Repo Discovery")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

GITHUB_URL = "https://api.github.com"
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen2.5:3b")

class BookmarkIn(BaseModel):
    full_name: str
    name: str
    owner: str
    description: str | None = None
    html_url: str
    language: str | None = None
    stars: int = 0
    forks: int = 0

class CompareIn(BaseModel):
    repos: list[str] = Field(min_length=2, max_length=4)

class AIIn(BaseModel):
    repo: dict[str, Any]

async def github_get(path: str, params: dict | None = None):
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(f"{GITHUB_URL}{path}", params=params, headers=headers)
    if response.status_code >= 400:
        detail = response.json().get("message", "GitHub API request failed") if response.headers.get("content-type", "").startswith("application/json") else "GitHub API request failed"
        raise HTTPException(response.status_code, detail)
    return response.json()

async def get_repo(full_name: str):
    return await github_get(f"/repos/{full_name}")

@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}

@app.get("/api/search")
async def search(q: str = "", language: str = "", topic: str = "", sort: str = "stars"):
    terms = [q.strip(), f"language:{language}" if language else "", f"topic:{topic}" if topic else ""]
    search_q = " ".join(x for x in terms if x) or "stars:>100"
    sort = sort if sort in {"stars", "forks", "updated", "help-wanted-issues"} else "stars"
    data = await github_get("/search/repositories", {"q": search_q, "sort": sort, "order": "desc", "per_page": 12})
    return data["items"]

@app.get("/api/repository/{owner}/{repo}")
async def repository(owner: str, repo: str):
    item = await get_repo(f"{owner}/{repo}")
    readme = ""
    try:
        readme_data = await github_get(f"/repos/{owner}/{repo}/readme", {"ref": item.get("default_branch")})
        readme = base64.b64decode(readme_data["content"]).decode("utf-8", errors="ignore")
    except HTTPException:
        pass
    languages = await github_get(f"/repos/{owner}/{repo}/languages")
    topics = await github_get(f"/repos/{owner}/{repo}/topics")
    return {**item, "readme": readme[:12000], "languages": languages, "topics": topics.get("names", [])}

@app.get("/api/repository/{owner}/{repo}/stars")
async def star_history(owner: str, repo: str, db: Session = Depends(get_db)):
    full_name = f"{owner}/{repo}"
    data = await github_get(f"/repos/{full_name}/stargazers/history", {"per_page": 24})
    points = [{"week": datetime.fromtimestamp(x["week"]).strftime("%Y-%m-%d"), "stars": x["total"]} for x in reversed(data)]
    current = await get_repo(full_name)
    db.add(StarSnapshot(full_name=full_name, stars=current["stargazers_count"]))
    db.commit()
    return {"current": current["stargazers_count"], "history": points}

@app.get("/api/bookmarks")
def bookmarks(db: Session = Depends(get_db)):
    rows = db.scalars(select(Bookmark).order_by(desc(Bookmark.created_at))).all()
    return [serialize_bookmark(x) for x in rows]

def serialize_bookmark(x: Bookmark):
    return {"id": x.id, "full_name": x.full_name, "name": x.name, "owner": x.owner, "description": x.description, "html_url": x.html_url, "language": x.language, "stars": x.stars, "forks": x.forks}

@app.post("/api/bookmarks")
def add_bookmark(item: BookmarkIn, db: Session = Depends(get_db)):
    existing = db.scalar(select(Bookmark).where(Bookmark.full_name == item.full_name))
    if existing:
        return serialize_bookmark(existing)
    row = Bookmark(**item.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return serialize_bookmark(row)

@app.delete("/api/bookmarks/{full_name:path}")
def delete_bookmark(full_name: str, db: Session = Depends(get_db)):
    row = db.scalar(select(Bookmark).where(Bookmark.full_name == full_name))
    if not row:
        raise HTTPException(404, "Bookmark not found")
    db.delete(row)
    db.commit()
    return {"ok": True}

@app.post("/api/compare")
async def compare(item: CompareIn):
    repos = []
    for full_name in item.repos:
        repos.append(await get_repo(full_name.strip()))
    return repos

async def ask_qwen(prompt: str):
    payload = {"model": QWEN_MODEL, "prompt": prompt, "stream": False}
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
        response.raise_for_status()
        return response.json().get("response", "").strip()
    except httpx.HTTPError as exc:
        raise HTTPException(503, f"Ollama unavailable: {exc}")

@app.post("/api/ai/summary")
async def ai_summary(item: AIIn):
    repo = item.repo
    prompt = f"Give a concise analysis of this GitHub repository for a developer. Return exactly three sections: Summary, Category, Useful For. Keep each section to 1-2 sentences. Do not invent features.\n\nName: {repo.get('full_name')}\nDescription: {repo.get('description')}\nLanguage: {repo.get('language')}\nTopics: {', '.join(repo.get('topics', []))}\nREADME:\n{repo.get('readme', '')[:6000]}"
    return {"result": await ask_qwen(prompt)}

@app.post("/api/ai/recommend")
async def ai_recommend(item: AIIn):
    repo = item.repo
    prompt = f"Suggest 3 GitHub repository search ideas related to this project. Return only three numbered lines, with a short reason after each. Do not use markdown tables.\nProject: {repo.get('full_name')}\nDescription: {repo.get('description')}\nLanguage: {repo.get('language')}\nTopics: {', '.join(repo.get('topics', []))}"
    return {"result": await ask_qwen(prompt)}
