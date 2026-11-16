// Reads the book list and PDF bytes from the GitHub repository that holds the library.
import "server-only";

const API = "https://api.github.com";

function cfg() {
  const repo = process.env.GITHUB_REPO; // "owner/name"
  if (!repo) throw new Error("GITHUB_REPO is not set");
  return {
    repo,
    branch: process.env.GITHUB_BRANCH || "main",
    // Only PDFs under this folder are listed ("" = whole repo).
    prefix: (process.env.GITHUB_BOOKS_PATH || "").replace(/^\/+|\/+$/g, ""),
    token: process.env.GITHUB_TOKEN,
  };
}

function authHeaders(): Record<string, string> {
  const { token } = cfg();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type RepoPdf = { path: string; sha: string; size: number; lfs: boolean };

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

/** Raw-file URL. LFS files are served from media.githubusercontent.com. */
export function rawUrl(path: string, lfs: boolean): string {
  const { repo, branch } = cfg();
  const host = lfs
    ? `https://media.githubusercontent.com/media/${repo}`
    : `https://raw.githubusercontent.com/${repo}`;
  return `${host}/${encodeURIComponent(branch).replace(/%2F/g, "/")}/${encodePath(path)}`;
}

/** Fetch (part of) a PDF straight from GitHub, forwarding a Range header if given. */
export function fetchFromGitHub(path: string, lfs: boolean, range?: string | null) {
  return fetch(rawUrl(path, lfs), {
    headers: { ...authHeaders(), ...(range ? { Range: range } : {}) },
    cache: "no-store",
  });
}

/** Parse a Git LFS pointer file; returns null if the text isn't one. */
export function parseLfsPointer(text: string): { oid: string; size: number } | null {
  if (!text.startsWith("version https://git-lfs")) return null;
  const oid = /oid sha256:([0-9a-f]+)/.exec(text)?.[1];
  const size = Number(/size (\d+)/.exec(text)?.[1]);
  return oid && size ? { oid, size } : null;
}

/** List every PDF in the repo (under GITHUB_BOOKS_PATH) using the recursive git tree API. */
export async function listRepoPdfs(): Promise<RepoPdf[]> {
  const { repo, branch, prefix } = cfg();
  const res = await fetch(
    `${API}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    {
      headers: { ...authHeaders(), Accept: "application/vnd.github+json" },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`GitHub tree request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    truncated: boolean;
    tree: { path: string; type: string; sha: string; size?: number }[];
  };

  const items = data.tree.filter(
    (t) =>
      t.type === "blob" &&
      /\.pdf$/i.test(t.path) &&
      (prefix === "" || t.path.startsWith(prefix + "/")),
  );

  // Tiny "PDFs" are probably Git LFS pointers; read them to get the real size and id.
  return Promise.all(
    items.map(async (t): Promise<RepoPdf> => {
      const size = t.size ?? 0;
      if (size < 1024) {
        const ptr = await fetchFromGitHub(t.path, false).then((r) => (r.ok ? r.text() : ""));
        const lfs = parseLfsPointer(ptr);
        if (lfs) return { path: t.path, sha: lfs.oid, size: lfs.size, lfs: true };
      }
      return { path: t.path, sha: t.sha, size, lfs: false };
    }),
  );
}

export function titleFromPath(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file
    .replace(/\.pdf$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s*-\s*/g, " – ")
    .replace(/\s+/g, " ")
    .trim();
}
