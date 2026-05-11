// Local usage: set env vars then run `npx markdown-confluence-sync`
// Required env vars:
//   CONFLUENCE_URL           — e.g. https://yourorg.atlassian.net/wiki
//   CONFLUENCE_SPACE_KEY     — e.g. SAM
//   CONFLUENCE_ROOT_PAGE_ID  — numeric ID of the parent page
//   ATLASSIAN_USERNAME       — Atlassian account email
//   ATLASSIAN_API_TOKEN      — API token from https://id.atlassian.com/manage-profile/security/api-tokens

module.exports = {
  docsDir: "./doc",
  confluence: {
    url: process.env.CONFLUENCE_URL,
    spaceKey: process.env.CONFLUENCE_SPACE_KEY,
    rootPageId: process.env.CONFLUENCE_ROOT_PAGE_ID,
    authentication: {
      basic: {
        username: process.env.ATLASSIAN_USERNAME,
        apiToken: process.env.ATLASSIAN_API_TOKEN,
      },
    },
  },
};
