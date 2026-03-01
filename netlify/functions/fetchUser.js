// netlify/functions/fetchUser.js
import jwt from "jsonwebtoken";
import crypto from "crypto";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { categories, username, password, hwid } = JSON.parse(event.body || "{}");
  if (!categories || !username || !password || hwid === undefined) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing fields" }),
    };
  }

  // API token check (unchanged)
  const authHeader = event.headers.authorization || "";
  const apiToken = authHeader.replace("Bearer ", "").trim();
  if (!apiToken) {
    return { statusCode: 403, body: JSON.stringify({ error: "Missing API token" }) };
  }

  // Native fetch (Node 18)
  const tokenResp = await fetch(process.env.GITHUB_TOKEN_FILE_URL);
  const tokens = await tokenResp.json();

  if (!tokens[apiToken]) {
    return { statusCode: 403, body: JSON.stringify({ error: "Invalid API token" }) };
  }

  const categoryList = categories.split(",").map(c => c.trim());

  const {
    GITHUB_TOKEN,
    GITHUB_USER,
    GITHUB_REPO,
    GITHUB_FILE,
    JWT_SECRET
  } = process.env;

  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3.raw",
    },
  });

  if (!res.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to fetch GitHub file" }) };
  }

  const data = await res.json();

  for (const category of categoryList) {
    const user = data[category]?.[username];
    if (!user) continue;
    if (user.password !== password) continue;

    let savedHWID = (user.hwid || "").trim();
    const isFree = savedHWID.toLowerCase() === "free";

    if (!isFree) {
      if (savedHWID === "") {
        user.hwid = hwid;
        await saveGitHub(url, data, GITHUB_TOKEN);
        savedHWID = hwid;
      } else if (savedHWID !== hwid) {
        return { statusCode: 401, body: JSON.stringify({ error: "HWID mismatch" }) };
      }
    }

    const hwidHash = crypto
      .createHash("sha256")
      .update(savedHWID)
      .digest("hex");

    const token = jwt.sign(
      {
        username,
        category,
        free: isFree,
        hwidHash,
        loginMessage: user.loginMessage || ""
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
}

async function saveGitHub(url, data, token) {
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
      message: "Bind HWID",
      content,
      sha: meta.sha,
    }),
  });
}
