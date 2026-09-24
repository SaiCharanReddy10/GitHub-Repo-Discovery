const base = "http://localhost:8000/api"

async function request(url, options = {}) {
  const res = await fetch(base + url, {headers: {"Content-Type": "application/json"}, ...options})
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Request failed")
  return res.json()
}

export const searchRepos = (params) => request(`/search?${new URLSearchParams(params)}`)
export const getRepo = (fullName) => request(`/repository/${fullName}`)
export const getStars = (fullName) => request(`/repository/${fullName}/stars`)
export const getBookmarks = () => request("/bookmarks")
export const saveBookmark = (repo) => request("/bookmarks", {method: "POST", body: JSON.stringify({full_name: repo.full_name, name: repo.name, owner: repo.owner.login, description: repo.description, html_url: repo.html_url, language: repo.language, stars: repo.stargazers_count, forks: repo.forks_count})})
export const removeBookmark = (fullName) => request(`/bookmarks/${encodeURIComponent(fullName)}`, {method: "DELETE"})
export const compareRepos = (repos) => request("/compare", {method: "POST", body: JSON.stringify({repos})})
export const aiSummary = (repo) => request("/ai/summary", {method: "POST", body: JSON.stringify({repo})})
export const aiRecommend = (repo) => request("/ai/recommend", {method: "POST", body: JSON.stringify({repo})})
