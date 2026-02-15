const https = require("https");

const GITHUB_UID_JSON_URL = "https://raw.githubusercontent.com/eren-6c/binanceiamge/main/uids_status.json";

exports.handler = async function(event, context) {
  const uid = event.queryStringParameters?.uid;

  if (!uid) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        status: "error",
        message: "UID query parameter is required",
        authorized: false
      }),
      headers: { "Content-Type": "application/json" }
    };
  }

  try {
    // Fetch JSON from GitHub
    const data = await fetchGitHubJSON(GITHUB_UID_JSON_URL);

    // Lookup UID in JSON
    const uidData = data[uid];

    if (uidData) {
      return {
        statusCode: 200,
        body: JSON.stringify(uidData),
        headers: { "Content-Type": "application/json" }
      };
    } else {
      // UID not found
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          status: "not_authorized",
          message: "UID not authorized",
          authorized: false
        }),
        headers: { "Content-Type": "application/json" }
      };
    }
  } catch (err) {
    console.error("Error fetching UID data:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        status: "error",
        message: "Internal server error",
        authorized: false
      }),
      headers: { "Content-Type": "application/json" }
    };
  }
};

// Helper function to fetch JSON from GitHub
function fetchGitHubJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";

      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", err => reject(err));
  });
}
