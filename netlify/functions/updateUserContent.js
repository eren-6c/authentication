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

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_USER = process.env.GITHUB_USER;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_FILE = process.env.GITHUB_FILE;

  const fileUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  try {
    // 1️⃣ Get current JSON and SHA for update
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

    // 2️⃣ Check user exists
    if (!content[category] || !content[category][username]) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    // 3️⃣ Update fields
    const allowedFields = ['username', 'password', 'hwid', 'expiryDate', 'loginMessage', 'creationDate'];
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        content[category][username][key] = updates[key];
      }
    }

    // 4️⃣ Commit updated JSON back to GitHub
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
