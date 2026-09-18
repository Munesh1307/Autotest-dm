import Api from "./interceptor";

// GET API
export const getApi = async (url, params) => {
  try {
    // Check if this is a file download request
    const isFileDownload = url.includes('download');
    
    const result = isFileDownload 
      ? await Api.get(url, { 
          params, 
          responseType: 'blob',
        })
      : await Api.get(url, { params });
    
    if (result.status >= 200 && result.status < 300) {
      return result.data;
    }
  } catch (error) {
    console.error('API Error:', error);
    return error?.response?.data;
  }
};

// PUT API (Update Data)
export const putApi = async (url, data) => {
  try {
    const result = await Api.put(url, data);
    if (result.status >= 200 && result.status < 300) {
      return result.data;
    }
  } catch (error) {
    return error?.response?.data;
  }
};

// PATCH API (Partial Update)
export const patchApi = async (url, data) => {
  try {
    const result = await Api.patch(url, data);
    if (result.status >= 200 && result.status < 300) {
      return result.data;
    }
  } catch (error) {
    return error?.response?.data;
  }
};

// POST API (Send Data)
export const postApi = async (url, data) => {
  try {
    const headers = data instanceof FormData ? { "Content-Type": "multipart/form-data" } : {};
    
    const result = await Api.post(url, data, { headers });

    if (result.status >= 200 && result.status < 300) {
      return result.data;
    }
  } catch (error) {
    return error?.response?.data;
  }
};

// DELETE API
export const deleteApi = async (url, data) => {
  try {
    const result = await Api.delete(url, { data });
    if (result.status >= 200 && result.status < 300) {
      return result.data;
    }
  } catch (error) {
    return error?.response?.data;
  }
};
