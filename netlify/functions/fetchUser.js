// netlify/functions/fetchUser.js
import fetch from 'node-fetch';

export async function handler(event) {
  const { category, username, password, hwid } = event.queryStringParameters || {};

  if (!category || !username || !password || hwid === undefined) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing category, username, password, or hwid' }),
    };
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_USER = process.env.GITHUB_USER;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_FILE = process.env.GITHUB_FILE;

  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  try {
    // Fetch GitHub JSON
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
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' }),
      };
    }

    const user = data[category][username];

    // Check password
    if (user.password !== password) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' }),
      };
    }

    // HWID check
    if (user.hwid) {
      // User already has a bound HWID → must match
      if (hwid !== user.hwid) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'Invalid credentials' }),
        };
      }
    } else {
      // User has no HWID yet → return empty hwid
      user.hwid = "";
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
