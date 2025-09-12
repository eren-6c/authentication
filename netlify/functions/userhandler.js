import fetch from "node-fetch";

export async function handler(event) {
  const { username, category, hwid, action } = event.queryStringParameters;

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_USER;
  const repo = process.env.GITHUB_REPO;
  const path = process.env.GITHUB_FILE;

  try {
    // 1. Fetch file metadata (get sha and download URL)
    const fileResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: { Authorization: `token ${token}` },
      }
    );

    if (!fileResp.ok) throw new Error("❌ Failed to fetch file metadata");

    const fileData = await fileResp.json();
    const sha = fileData.sha;

    // 2. Download the actual JSON
    const jsonResp = await fetch(fileData.download_url);
    const data = await jsonResp.json();

    // 3. Validate category & user
    const categoryBlock = data[category];
    if (!categoryBlock) {
      return { statusCode: 404, body: JSON.stringify({ error: "Category not found" }) };
    }

    const user = categoryBlock[username];
    if (!user) {
      return { statusCode: 404, body: JSON.stringify({ error: "User not found" }) };
    }

    // ✅ Action: Fetch User
    if (action === "fetch") {
      return {
        statusCode: 200,
        body: JSON.stringify(user, null, 2),
      };
    }

    // ✅ Action: Update HWID
    if (action === "updatehwid") {
      if (!hwid) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing hwid" }) };
      }

      user.hwid = hwid;
      user.lastUsed = new Date().toISOString().replace("T", " ").split(".")[0];

      // Encode and push update
      const updatedContent = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");

      const updateResp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: "PUT",
          headers: {
            Authorization: `token ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `Update HWID for ${username} in ${category}`,
            content: updatedContent,
            sha,
          }),
        }
      );

      if (!updateResp.ok) throw new Error("❌ Failed to update GitHub file");

      const updateResult = await updateResp.json();

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          updatedUser: user,
          commit: updateResult.commit.sha,
        }),
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid or missing action parameter" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
