import {useEffect, useState} from "react"
import {aiRecommend, aiSummary, compareRepos, getBookmarks, getRepo, getStars, removeBookmark, saveBookmark, searchRepos} from "./api"

function RepoCard({repo, onOpen, onSave, saved}) {
  return <article className="card">
    <div className="card-head"><h3>{repo.full_name}</h3><span>{repo.language || "Unknown"}</span></div>
    <p>{repo.description || "No description available."}</p>
    <div className="stats"><b>★ {repo.stargazers_count?.toLocaleString()}</b><span>Forks {repo.forks_count?.toLocaleString()}</span></div>
    <div className="tags">{repo.topics?.slice(0, 4).map(t => <span key={t}>{t}</span>)}</div>
    <div className="actions"><button onClick={() => onOpen(repo.full_name)}>Details</button><button disabled={saved} onClick={() => onSave(repo)}>{saved ? "Saved" : "Bookmark"}</button><a href={repo.html_url} target="_blank">GitHub ↗</a></div>
  </article>
}

export default function App() {
  const [query, setQuery] = useState("fastapi")
  const [language, setLanguage] = useState("")
  const [topic, setTopic] = useState("")
  const [sort, setSort] = useState("stars")
  const [repos, setRepos] = useState([])
  const [bookmarks, setBookmarks] = useState([])
  const [selected, setSelected] = useState(null)
  const [history, setHistory] = useState(null)
  const [ai, setAi] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [compare, setCompare] = useState([])
  const [compareRows, setCompareRows] = useState([])

  const runSearch = async () => { setLoading(true); setError(""); try { setRepos(await searchRepos({q: query, language, topic, sort})) } catch(e) { setError(e.message) } finally { setLoading(false) } }
  const loadBookmarks = async () => setBookmarks(await getBookmarks())
  useEffect(() => { runSearch(); loadBookmarks() }, [])

  const openRepo = async (name) => { setError(""); setHistory(null); setAi(""); try { const repo = await getRepo(name); setSelected(repo) } catch(e) { setError(e.message) } }
  const save = async (repo) => { await saveBookmark(repo); loadBookmarks() }
  const remove = async (name) => { await removeBookmark(name); loadBookmarks() }
  const trackStars = async () => { if (selected) setHistory(await getStars(selected.full_name)) }
  const summarize = async () => { setAi("Loading..."); try { setAi((await aiSummary(selected)).result) } catch(e) { setAi(e.message) } }
  const recommend = async () => { setAi("Loading..."); try { setAi((await aiRecommend(selected)).result) } catch(e) { setAi(e.message) } }
  const toggleCompare = (name) => setCompare(x => x.includes(name) ? x.filter(v => v !== name) : x.length < 4 ? [...x, name] : x)
  const runCompare = async () => { try { setCompareRows(await compareRepos(compare)) } catch(e) { setError(e.message) } }

  return <div className="app">
    <header><div><h1>RepoScout</h1><p>Find useful GitHub projects without digging through endless search results.</p></div><div className="pill">FastAPI + React + PostgreSQL</div></header>
    <section className="search"><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} placeholder="Search repositories"/><input value={language} onChange={e => setLanguage(e.target.value)} placeholder="Language"/><input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic"/><select value={sort} onChange={e => setSort(e.target.value)}><option value="stars">Stars</option><option value="forks">Forks</option><option value="updated">Recently updated</option></select><button onClick={runSearch}>Search</button></section>
    {error && <div className="error">{error}</div>}
    <main>
      <section><div className="section-title"><h2>Repositories</h2><span>{repos.length} results</span></div>{loading ? <div className="empty">Searching GitHub...</div> : <div className="grid">{repos.map(repo => <RepoCard key={repo.id} repo={repo} onOpen={openRepo} onSave={save} saved={bookmarks.some(x => x.full_name === repo.full_name)}/>)}</div>}</section>
      <aside><h2>Bookmarks</h2>{bookmarks.length ? bookmarks.map(x => <div className="bookmark" key={x.full_name}><div><b>{x.full_name}</b><small>★ {x.stars.toLocaleString()} · {x.language || "Unknown"}</small></div><button onClick={() => remove(x.full_name)}>×</button></div>) : <div className="empty">Nothing saved yet.</div>}
      <h2 className="compare-title">Compare</h2>{bookmarks.map(x => <label className="check" key={x.full_name}><input type="checkbox" checked={compare.includes(x.full_name)} onChange={() => toggleCompare(x.full_name)}/>{x.full_name}</label>)}<button className="full" disabled={compare.length < 2} onClick={runCompare}>Compare selected</button>{compareRows.length > 0 && <div className="comparison">{compareRows.map(x => <div key={x.full_name}><b>{x.full_name}</b><span>★ {x.stargazers_count.toLocaleString()}</span><span>Forks {x.forks_count.toLocaleString()}</span><span>{x.language || "Unknown"}</span></div>)}</div>}</aside>
    </main>
    {selected && <div className="modal-wrap" onClick={() => setSelected(null)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><h2>{selected.full_name}</h2><p>{selected.description}</p></div><button onClick={() => setSelected(null)}>Close</button></div><div className="detail-grid"><div><b>Stars</b><span>★ {selected.stargazers_count.toLocaleString()}</span></div><div><b>Forks</b><span>{selected.forks_count.toLocaleString()}</span></div><div><b>Language</b><span>{selected.language || "Unknown"}</span></div><div><b>Topics</b><span>{selected.topics?.join(", ") || "None"}</span></div></div><div className="modal-actions"><button onClick={trackStars}>Star history</button><button onClick={summarize}>AI summary</button><button onClick={recommend}>AI recommendations</button><a href={selected.html_url} target="_blank">Open GitHub ↗</a></div>{history && <div className="history"><h3>Weekly star totals</h3><div className="bars">{history.history.slice(-12).map(x => <div key={x.week} title={`${x.week}: ${x.stars}`}><span style={{height: `${Math.max(6, Math.min(100, x.stars / Math.max(history.current, 1) * 100))}%`}}></span><small>{x.week.slice(5)}</small></div>)}</div></div>}{ai && <pre className="ai">{ai}</pre>}<details><summary>README</summary><pre>{selected.readme || "No README content found."}</pre></details></div></div>}
  </div>
}
