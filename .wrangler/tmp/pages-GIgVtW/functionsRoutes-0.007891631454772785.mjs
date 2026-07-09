import { onRequestPost as __chat_js_onRequestPost } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/chat.js"
import { onRequestPost as __send_otp_js_onRequestPost } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/send-otp.js"
import { onRequestPost as __verify_otp_js_onRequestPost } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/verify-otp.js"

export const routes = [
    {
      routePath: "/chat",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__chat_js_onRequestPost],
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