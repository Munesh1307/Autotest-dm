import axios from "axios";
import Cookies from "js-cookie";

const BaseUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;

const Api = axios.create({
  timeout: 1000000,
  baseURL: BaseUrl,
});

Api.defaults.headers.post["Content-Type"] = "application/json;charset=utf-8";
Api.defaults.headers.post["Access-Control-Allow-Origin"] = "*";

Api.interceptors.request.use(
  (config) => {
    const token = Cookies.get("token"); // Get token from cookies
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

Api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 errors globally
Api.interceptors.response.use(
  (response) => {
    if (response.status === 401) {
      Cookies.remove("token"); // Remove token from cookies
      Cookies.remove("profileStatus");
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove("token"); // Remove token from cookies
      Cookies.remove("profileStatus"); 
    }
    return Promise.reject(error);
  }
);

export default Api;
