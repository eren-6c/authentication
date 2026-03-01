// netlify/functions/login.js
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import crypto from "crypto";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { username, password, hwid } = JSON.parse(event.body || "{}");
  if (!username || !password || hwid === undefined) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing credentials" }) };
  }

  const {
    GITHUB_TOKEN,
    GITHUB_USER,
    GITHUB_REPO,
    GITHUB_FILE,
    JWT_SECRET
  } = process.env;

  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3.raw"
      }
    });

    const data = await res.json();

    for (const category of Object.keys(data)) {
      const user = data[category]?.[username];
      if (!user) continue;
      if (user.password !== password) continue;

      let savedHWID = (user.hwid || "").trim();
      const isFree = savedHWID.toLowerCase() === "free";

      if (!isFree) {
        if (savedHWID === "") {
          user.hwid = hwid;
          await saveGitHubFile(url, data, GITHUB_TOKEN, username);
          savedHWID = hwid;
        } else if (savedHWID !== hwid) {
          continue;
        }
      }

      const hwidHash = crypto
        .createHash("sha256")
        .update(savedHWID)
        .digest("hex");

      const token = jwt.sign(
        {
          sub: username,
          category,
          free: isFree,
          hwidHash
        },
        JWT_SECRET,
        { expiresIn: "2h" }
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ token })
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
      Accept: "application/vnd.github.v3+json"
    }
  }).then(r => r.json());

  const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");

  await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json"
    },
    body: JSON.stringify({
      message: `Bind HWID for ${username}`,
      content,
      sha: meta.sha
    })
  });
}
