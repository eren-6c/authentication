// netlify/functions/fetchUser.js
import fetch from "node-fetch";

export async function handler(event) {
  const { category, username } = event.queryStringParameters || {};

  if (!category || !username) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing category or username" }),
    };
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_USER = process.env.GITHUB_USER;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_FILE = process.env.GITHUB_FILE;

  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3.raw",
      },
    });

    if (!res.ok) throw new Error("Failed to fetch GitHub file");

    const data = await res.json(); // JSON from GitHub

    if (!data[category] || !data[category][username]) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "User not found" }),
      };
    }

    const user = data[category][username];

    return {
      statusCode: 200,
      body: JSON.stringify({ user }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
