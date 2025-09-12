// netlify/functions/fetchUser.js
import fetch from 'node-fetch';

export async function handler(event) {
  const { category, username, password, hwid } = event.queryStringParameters || {};

  if (!category || !username || !password) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing category, username, or password' }),
    };
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_USER = process.env.GITHUB_USER;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_FILE = process.env.GITHUB_FILE;

  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  try {
    // Fetch the GitHub JSON
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3.raw',
      },
    });

    if (!res.ok) throw new Error('Failed to fetch GitHub file');

    const data = await res.json();

    // Check if category and user exist
    if (!data[category] || !data[category][username]) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    const user = data[category][username];

    // Check password
    if (user.password !== password) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid password' }),
      };
    }

    // ✅ HWID logic
    if (user.hwid) {
      // User already has a HWID, must match if provided
      if (hwid && hwid !== user.hwid) {
        return {
          statusCode: 403,
          body: JSON.stringify({ error: 'HWID mismatch' }),
        };
      }
    } else {
      // User has no HWID yet, bind it if a value is provided
      if (hwid) {
        user.hwid = hwid;

        // Commit HWID to GitHub
        const fileInfo = await fetch(url, {
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }).then(r => r.json());

        const sha = fileInfo.sha;

        await fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
          },
          body: JSON.stringify({
            message: `Bind HWID for user ${username}`,
            content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
            sha,
          }),
        });
      }
    }

    // ✅ Return username + all user fields at top level
    return {
      statusCode: 200,
      body: JSON.stringify({
        username,
        ...user
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
