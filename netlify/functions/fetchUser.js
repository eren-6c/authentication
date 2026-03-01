// netlify/functions/fetchUser.js
import fetch from "node-fetch";
import crypto from 'crypto';

// Secret key for request signing (store in environment variables)
const REQUEST_SIGNING_KEY = process.env.REQUEST_SIGNING_KEY;

function generateSignature(data) {
  return crypto
    .createHmac('sha256', REQUEST_SIGNING_KEY)
    .update(data)
    .digest('hex');
}

export async function handler(event) {
  const { categories, username, password, hwid, timestamp, signature } = event.queryStringParameters || {};

  if (!categories || !username || !password || hwid === undefined || !timestamp || !signature) {
    return {
      statusCode: 400,
      body: JSON.stringify({ 
        error: "Missing required parameters",
        code: "MISSING_PARAMS"
      }),
    };
  }

  // Check timestamp to prevent replay attacks (5 minute window)
  const requestTime = parseInt(timestamp);
  const currentTime = Date.now();
  if (Math.abs(currentTime - requestTime) > 300000) { // 5 minutes
    return {
      statusCode: 401,
      body: JSON.stringify({ 
        error: "Request expired",
        code: "EXPIRED_REQUEST"
      }),
    };
  }

  // Verify signature
  const dataToSign = `${categories}|${username}|${password}|${hwid}|${timestamp}`;
  const expectedSignature = generateSignature(dataToSign);
  
  if (signature !== expectedSignature) {
    return {
      statusCode: 403,
      body: JSON.stringify({ 
        error: "Invalid request signature",
        code: "INVALID_SIGNATURE"
      }),
    };
  }

  // Convert categories string into an array
  const categoryList = categories.split(",").map(c => c.trim());

  // Validate API token
  const authHeader = event.headers.authorization || "";
  const apiToken = authHeader.replace("Bearer ", "").trim();
  if (!apiToken) {
    return { 
      statusCode: 403, 
      body: JSON.stringify({ 
        error: "Missing API token",
        code: "MISSING_TOKEN"
      }) 
    };
  }

  // Fetch token permissions
  const TOKEN_FILE_URL = process.env.GITHUB_TOKEN_FILE_URL;
  let tokens;
  try {
    const tokenResp = await fetch(TOKEN_FILE_URL);
    tokens = await tokenResp.json();
  } catch {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        error: "Failed to read token permissions",
        code: "TOKEN_READ_ERROR"
      }) 
    };
  }

  const tokenData = tokens[apiToken];
  if (!tokenData) {
    return { 
      statusCode: 403, 
      body: JSON.stringify({ 
        error: "Invalid API token",
        code: "INVALID_TOKEN"
      }) 
    };
  }

  // Check read permissions for at least one category
  const allowedReadCategories = tokenData.read || [];
  const validCategories = categoryList.filter(c => allowedReadCategories.includes(c));
  if (validCategories.length === 0) {
    return { 
      statusCode: 403, 
      body: JSON.stringify({ 
        error: "Token has no read permission for these categories",
        code: "NO_PERMISSION"
      }) 
    };
  }

  // GitHub repo info
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

    // Try each category until we find the user
    for (const category of validCategories) {
      if (data[category] && data[category][username]) {
        const user = data[category][username];

        if (user.password !== password) {
          continue; // wrong password in this category, try next
        }

        // HWID logic - ALL VALIDATION DONE SERVER-SIDE
        const savedHWID = (user.hwid || "").trim();
        
        // Check if user is banned
        if (user.banned === true) {
          return {
            statusCode: 403,
            body: JSON.stringify({ 
              error: "Account is banned",
              code: "ACCOUNT_BANNED"
            }),
          };
        }

        // Handle different HWID states
        let hwidStatus = "valid";
        let responseData = {
          category,
          username,
          expiresAt: user.expiresAt,
          permissions: user.permissions || [],
          loginMessage: user.loginMessage,
          isFree: savedHWID.toLowerCase() === "free"
        };

        if (savedHWID.toLowerCase() === "free") {
          // Free user - return special status
          hwidStatus = "free";
          responseData.hwidStatus = "free";
        } else if (savedHWID === "") {
          // First login - bind HWID
          user.hwid = hwid;
          user.firstLogin = new Date().toISOString();
          
          // Save file back to GitHub
          const fileRes = await fetch(url, {
            headers: {
              Authorization: `token ${GITHUB_TOKEN}`,
              Accept: "application/vnd.github.v3+json",
            },
          });
          const fileMeta = await fileRes.json();

          const updatedContent = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");

          const updateResponse = await fetch(url, {
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

          if (!updateResponse.ok) {
            throw new Error("Failed to save HWID");
          }

          responseData.hwidStatus = "bound";
          responseData.hwid = hwid;
        } else if (hwid !== savedHWID) {
          // HWID mismatch - log this attempt
          console.warn(`HWID mismatch for user ${username}: expected ${savedHWID}, got ${hwid}`);
          continue; // try next category
        } else {
          responseData.hwidStatus = "valid";
          responseData.hwid = savedHWID;
        }

        // Add server signature to response to prevent tampering
        const responseSignature = generateSignature(
          `${username}|${responseData.hwidStatus}|${responseData.isFree}|${Date.now()}`
        );
        responseData.serverSignature = responseSignature;
        responseData.timestamp = Date.now();

        return {
          statusCode: 200,
          body: JSON.stringify(responseData),
        };
      }
    }

    return { 
      statusCode: 401, 
      body: JSON.stringify({ 
        error: "Invalid credentials in all categories",
        code: "INVALID_CREDENTIALS"
      }) 
    };

  } catch (err) {
    console.error("Server error:", err);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        error: "Internal server error",
        code: "SERVER_ERROR"
      }) 
    };
  }
}
