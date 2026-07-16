const GIST_API = "https://api.github.com/gists";

export function parseGistUrl(url) {
  const match = url.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]+)/);
  return match ? match[1] : null;
}

export async function fetchGist(gistId) {
  const res = await fetch(`${GIST_API}/${gistId}`);
  if (!res.ok) throw new Error(`Gist not found (${res.status}). Note: only public gists can be imported.`);
  return res.json();
}

export async function findScribeGist(token) {
  let page = 1;
  const maxPages = 10;
  while (page <= maxPages) {
    const res = await fetch(`${GIST_API}?per_page=100&page=${page}`, {
      headers: { Authorization: `token ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to list gists (${res.status})`);
    const gists = await res.json();
    if (gists.length === 0) return null;
    const found = gists.find((g) => g.files?.["scribe.json"]);
    if (found) return found;
    page++;
  }
  return null;
}

export async function createScribeGist(token, data, isPublic) {
  const res = await fetch(GIST_API, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: "Ollama Scribe backup",
      public: isPublic,
      files: {
        "scribe.json": {
          content: JSON.stringify(data, null, 2),
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Failed to create gist (${res.status})`);
  return res.json();
}

export async function updateScribeGist(token, gistId, data) {
  const res = await fetch(`${GIST_API}/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: {
        "scribe.json": {
          content: JSON.stringify(data, null, 2),
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Failed to update gist (${res.status})`);
  return res.json();
}
