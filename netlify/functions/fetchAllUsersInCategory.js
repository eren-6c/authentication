// netlify/functions/fetchAllUsersInCategory.js
import fetch from 'node-fetch';

export async function handler(event) {
  const { category, token: tokenQuery } = event.queryStringParameters || {};

  if (!category) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing category parameter" }) };
  }

  // 1️⃣ Get API token (from header or query string)
  const authHeader = event.headers.authorization || "";
  const apiToken = authHeader.replace("Bearer ", "").trim() || tokenQuery;

  if (!apiToken) {
    return { statusCode: 403, body: JSON.stringify({ error: "Missing API token" }) };
  }

  // 2️⃣ Fetch token permissions from GitHub raw file
  const TOKEN_FILE_URL = process.env.GITHUB_TOKEN_FILE_URL;
  if (!TOKEN_FILE_URL) {
    return { statusCode: 500, body: JSON.stringify({ error: "Token file URL not configured" }) };
  }

  let tokens;
  try {
    const tokenResp = await fetch(TOKEN_FILE_URL);
    if (!tokenResp.ok) throw new Error("Failed to fetch token file");
    tokens = await tokenResp.json();
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to read token permissions" }) };
  }

  // 3️⃣ Check token validity & read permissions
  const tokenData = tokens[apiToken];
  if (!tokenData) {
    return { statusCode: 403, body: JSON.stringify({ error: "Invalid API token" }) };
  }

  const allowedReadCategories = tokenData.read || [];
  if (!allowedReadCategories.includes(category)) {
    return { statusCode: 403, body: JSON.stringify({ error: "Token does not have read permission for this category" }) };
  }

  // 4️⃣ Fetch user database from GitHub
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_USER = process.env.GITHUB_USER;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_FILE = process.env.GITHUB_FILE;

  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) throw new Error("Failed to fetch GitHub user database");

    const fileData = await res.json();

    // GitHub API returns base64 content, decode it
    const contentJson = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const data = JSON.parse(contentJson);

    if (!data[category]) {
      return { statusCode: 404, body: JSON.stringify({ error: "Category not found" }) };
    }

    // Sort users alphabetically for cleaner output
    const sortedUsers = {};
    Object.keys(data[category]).sort().forEach(key => {
      sortedUsers[key] = data[category][key];
    });

    // 5️⃣ Return all users in the requested category (pretty-printed)
    return {
      statusCode: 200,
      body: JSON.stringify(sortedUsers, null, 2),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
