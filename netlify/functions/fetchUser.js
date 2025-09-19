// netlify/functions/fetchUser.js
import fetch from "node-fetch";

export async function handler(event) {
  const { categories, username, password, hwid } = event.queryStringParameters || {};

  if (!categories || !username || !password || hwid === undefined) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing categories, username, password, or hwid" }),
    };
  }

  // Convert categories string into an array
  const categoryList = categories.split(",").map(c => c.trim());

  // ✅ Validate API token
  const authHeader = event.headers.authorization || "";
  const apiToken = authHeader.replace("Bearer ", "").trim();
  if (!apiToken) {
    return { statusCode: 403, body: JSON.stringify({ error: "Missing API token" }) };
  }

  // Fetch token permissions
  const TOKEN_FILE_URL = process.env.GITHUB_TOKEN_FILE_URL;
  let tokens;
  try {
    const tokenResp = await fetch(TOKEN_FILE_URL);
    tokens = await tokenResp.json();
  } catch {
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to read token permissions" }) };
  }

  const tokenData = tokens[apiToken];
  if (!tokenData) {
    return { statusCode: 403, body: JSON.stringify({ error: "Invalid API token" }) };
  }

  // Check read permissions for at least one category
  const allowedReadCategories = tokenData.read || [];
  const validCategories = categoryList.filter(c => allowedReadCategories.includes(c));
  if (validCategories.length === 0) {
    return { statusCode: 403, body: JSON.stringify({ error: "Token has no read permission for these categories" }) };
  }

  // ✅ GitHub repo info
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_USER = process.env.GITHUB_USER;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_FILE = process.env.GITHUB_FILE;

  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  try {
    // Fetch JSON file from GitHub
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3.raw",
      },
    });
    if (!res.ok) throw new Error("Failed to fetch GitHub file");

    const data = await res.json();

    // ✅ Try each category until we find the user
    for (const category of validCategories) {
      if (data[category] && data[category][username]) {
        const user = data[category][username];

        if (user.password !== password) {
          continue; // wrong password in this category, try next
        }

        // HWID logic
        const savedHWID = (user.hwid || "").trim();

        if (savedHWID.toLowerCase() === "free") {
          // free user → skip HWID check
        } else if (savedHWID === "") {
          // ✅ First login → bind HWID
          user.hwid = hwid;

          // Save file back to GitHub
          const fileRes = await fetch(url, {
            headers: {
              Authorization: `token ${GITHUB_TOKEN}`,
              Accept: "application/vnd.github.v3+json",
            },
          });
          const fileMeta = await fileRes.json();

          const updatedContent = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");

          await fetch(url, {
            method: "PUT",
            headers: {
              Authorization: `token ${GITHUB_TOKEN}`,
              Accept: "application/vnd.github.v3+json",
            },
            body: JSON.stringify({
              message: `Bind HWID for ${username} in category ${category}`,
              content: updatedContent,
              sha: fileMeta.sha,
            }),
          });
        } else if (hwid !== savedHWID) {
          continue; // invalid HWID, try next category
        }

        // ✅ Found valid user
        return {
          statusCode: 200,
          body: JSON.stringify({
            category,
            username,
            ...user,
          }),
        };
      }
    }

    return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials in all categories" }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
