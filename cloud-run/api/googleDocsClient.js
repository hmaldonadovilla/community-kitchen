const { createGoogleApiClient } = require('./googleApiClient');

const DOCS_API_BASE_URL = 'https://docs.googleapis.com/v1';

const createGoogleDocsClient = (deps = {}) => {
  const googleApiClient = deps.googleApiClient || createGoogleApiClient(deps);

  return {
    async batchUpdate(documentId, requests) {
      const id = (documentId || '').toString().trim();
      const requestList = Array.isArray(requests) ? requests.filter(Boolean) : [];
      if (!id) throw new Error('Google Docs document id is required.');
      if (!requestList.length) return { replies: [] };
      const url = `${DOCS_API_BASE_URL}/documents/${encodeURIComponent(id)}:batchUpdate`;
      return googleApiClient.request(url, {
        method: 'POST',
        body: { requests: requestList },
        responseType: 'json'
      });
    }
  };
};

module.exports = {
  createGoogleDocsClient
};
