(function () {
  const config = window.JIRO_CLOUD_CONFIG || {};
  const baseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const anonKey = String(config.supabaseAnonKey || "");

  function configured() {
    return Boolean(baseUrl && anonKey);
  }

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        apikey: anonKey,
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      let message = `Cloud request failed (${response.status})`;
      try {
        const error = await response.json();
        message = error.message || error.error_description || error.error || message;
      } catch {}
      throw new Error(message);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, body] = dataUrl.split(",");
    const mime = meta.match(/data:(.*?);/)?.[1] || "image/jpeg";
    const bytes = atob(body);
    const array = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
    return new Blob([array], { type: mime });
  }

  async function uploadPhoto(recordId, photo) {
    if (!photo?.startsWith("data:")) return null;
    const path = `${recordId}.jpg`;
    await request(`/storage/v1/object/ramen-photos/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "image/jpeg",
        "x-upsert": "true"
      },
      body: dataUrlToBlob(photo)
    });
    return path;
  }

  function publicPhotoUrl(path) {
    return path ? `${baseUrl}/storage/v1/object/public/ramen-photos/${path}` : "";
  }

  function recordPayload(record) {
    const { photo, photoPath, ...data } = record;
    return data;
  }

  async function saveRecord(record) {
    const uploadedPath = await uploadPhoto(record.id, record.photo);
    const photoPath = uploadedPath || record.photoPath || null;
    await request("/rest/v1/jiro_records?on_conflict=id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        id: record.id,
        data: recordPayload(record),
        photo_path: photoPath,
        updated_at: new Date().toISOString()
      })
    });
    return { ...record, photoPath, photo: publicPhotoUrl(photoPath) };
  }

  async function deleteRecord(record) {
    await request(`/rest/v1/jiro_records?id=eq.${encodeURIComponent(record.id)}`, { method: "DELETE" });
    if (record.photoPath) {
      await request("/storage/v1/object/ramen-photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [record.photoPath] })
      });
    }
  }

  async function saveWishlist(shop) {
    await request("/rest/v1/jiro_wishlist?on_conflict=id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        id: shop.id,
        data: shop,
        updated_at: new Date().toISOString()
      })
    });
  }

  async function deleteWishlist(id) {
    await request(`/rest/v1/jiro_wishlist?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async function fetchAll() {
    const [recordRows, wishlistRows] = await Promise.all([
      request("/rest/v1/jiro_records?select=*&order=updated_at.desc"),
      request("/rest/v1/jiro_wishlist?select=*&order=updated_at.desc")
    ]);
    return {
      records: recordRows.map(row => ({
        ...row.data,
        id: row.id,
        photoPath: row.photo_path,
        photo: publicPhotoUrl(row.photo_path)
      })),
      wishlist: wishlistRows.map(row => ({ ...row.data, id: row.id }))
    };
  }

  window.JiroCloud = {
    configured,
    fetchAll,
    saveRecord,
    deleteRecord,
    saveWishlist,
    deleteWishlist
  };
})();
