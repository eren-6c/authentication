// netlify/functions/updateUserContent.js
import fetch from 'node-fetch';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed. Use POST.' }) };
  }

  const body = JSON.parse(event.body || '{}');
  const { category, username, updates } = body;

  if (!category || !username || !updates) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing category, username, or updates object.' }),
    };
  }

  // ✅ 1. Validate API token
  const authHeader = event.headers.authorization || "";
  const apiToken = authHeader.replace("Bearer ", "").trim();
  if (!apiToken) {
    return { statusCode: 403, body: JSON.stringify({ error: "Missing API token" }) };
  }

  // 2. Fetch token permissions from GitHub raw file
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

  // 3. Check token validity & write permissions
  const tokenData = tokens[apiToken];
  if (!tokenData) {
    return { statusCode: 403, body: JSON.stringify({ error: "Invalid API token" }) };
  }

  const allowedWriteCategories = tokenData.write || [];
  if (!allowedWriteCategories.includes(category)) {
    return { statusCode: 403, body: JSON.stringify({ error: "Token does not have write permission for this category" }) };
  }

  // 4. Fetch user database from GitHub
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_USER = process.env.GITHUB_USER;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_FILE = process.env.GITHUB_FILE;

  const fileUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  try {
    const getRes = await fetch(fileUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!getRes.ok) throw new Error('Failed to fetch GitHub file');

    const fileData = await getRes.json();
    const sha = fileData.sha;
    const content = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));

    // 5. Check if user exists
    if (!content[category] || !content[category][username]) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    // 6. Update allowed fields
    const allowedFields = ['username', 'password', 'hwid', 'expiryDate', 'loginMessage', 'creationDate'];
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        content[category][username][key] = updates[key];
      }
    }

    // 7. Commit updated JSON back to GitHub
    const commitRes = await fetch(fileUrl, {
      method: 'PUT',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        message: `Update user ${username} in category ${category}`,
        content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
        sha,
      }),
    });

    if (!commitRes.ok) {
      const errData = await commitRes.json();
      throw new Error(errData.message || 'Failed to update GitHub file');
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, message: `User ${username} updated successfully` }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
