// netlify/functions/updateHWID.js
import fetch from 'node-fetch';

export async function handler(event) {
  const { category, username, password, updatedhwid } = event.queryStringParameters || {};

  if (!category || !username || !password || !updatedhwid) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing category, username, password, or updatedhwid' }),
    };
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_USER = process.env.GITHUB_USER;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_FILE = process.env.GITHUB_FILE;

  const fileUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  try {
    // 1️⃣ Get current JSON and SHA
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

    const user = content[category][username];

    // 3️⃣ Check password
    if (user.password !== password) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid password' }) };
    }

    // 4️⃣ Update HWID
    content[category][username].hwid = updatedhwid;

    // 5️⃣ Commit changes to GitHub
    const commitRes = await fetch(fileUrl, {
      method: 'PUT',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        message: `Update HWID for user ${username} in category ${category}`,
        content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
        sha,
      }),
    });

    if (!commitRes.ok) {
      const errData = await commitRes.json();
      throw new Error(errData.message || 'Failed to update GitHub file');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: `HWID updated successfully for ${username}` }),
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
