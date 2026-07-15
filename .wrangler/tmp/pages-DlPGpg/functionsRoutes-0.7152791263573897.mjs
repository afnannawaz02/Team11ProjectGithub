import { onRequestGet as __api_stock_js_onRequestGet } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/stock.js"
import { onRequest as __api_auth_js_onRequest } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/auth.js"
import { onRequestPost as __chat_js_onRequestPost } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/chat.js"
import { onRequestGet as __debug_js_onRequestGet } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/debug.js"
import { onRequestPost as __send_otp_js_onRequestPost } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/send-otp.js"
import { onRequestPost as __verify_otp_js_onRequestPost } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/verify-otp.js"

export const routes = [
    {
      routePath: "/api/stock",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_stock_js_onRequestGet],
    },
  {
      routePath: "/api/auth",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_auth_js_onRequest],
    },
  {
      routePath: "/chat",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__chat_js_onRequestPost],
    },
  {
      routePath: "/debug",
      mountPath: "/",
      method: "GET",
      middlewares: [],
      modules: [__debug_js_onRequestGet],
    },
  {
      routePath: "/send-otp",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__send_otp_js_onRequestPost],
    },
  {
      routePath: "/verify-otp",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__verify_otp_js_onRequestPost],
    },
  ]