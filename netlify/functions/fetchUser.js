// netlify/functions/login.js
import fetch from "node-fetch";
import jwt from "jsonwebtoken";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { username, password, hwid } = JSON.parse(event.body || "{}");
  if (!username || !password || hwid === undefined) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing credentials" }) };
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_USER = process.env.GITHUB_USER;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_FILE = process.env.GITHUB_FILE;
  const JWT_SECRET = process.env.JWT_SECRET;

  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3.raw",
      },
    });

    const data = await res.json();

    for (const category of Object.keys(data)) {
      const user = data[category]?.[username];
      if (!user) continue;
      if (user.password !== password) continue;

      const savedHWID = (user.hwid || "").trim();
      let isFree = savedHWID.toLowerCase() === "free";

      if (!isFree) {
        if (savedHWID === "") {
          user.hwid = hwid; // bind on first login
          await saveGitHubFile(url, data, GITHUB_TOKEN, username);
        } else if (savedHWID !== hwid) {
          continue;
        }
      }

      const token = jwt.sign(
        {
          sub: username,
          category,
          free: isFree,
        },
        JWT_SECRET,
        { expiresIn: "2h" }
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ token }),
      };
    }

    return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

async function saveGitHubFile(url, data, token, username) {
  const meta = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  }).then(r => r.json());

  const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");

  await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify({
      message: `Bind HWID for ${username}`,
      content,
      sha: meta.sha,
    }),
  });
}
