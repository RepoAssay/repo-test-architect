module.exports = async function loadCatalog(token) {
  const response = await fetch("/catalog", {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Catalog request failed with ${response.status}`);
  }

  return response.json();
};
