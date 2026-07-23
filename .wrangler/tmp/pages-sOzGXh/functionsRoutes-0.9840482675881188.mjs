import { onRequestGet as __api_finance_js_onRequestGet } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/finance.js"
import { onRequestGet as __api_spending_js_onRequestGet } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/spending.js"
import { onRequestGet as __api_stock_js_onRequestGet } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/stock.js"
import { onRequest as __api_alerts_js_onRequest } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/alerts.js"
import { onRequest as __api_auth_js_onRequest } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/auth.js"
import { onRequest as __api_budget_js_onRequest } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/budget.js"
import { onRequest as __api_chats_js_onRequest } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/chats.js"
import { onRequest as __api_coinbase_js_onRequest } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/coinbase.js"
import { onRequest as __api_goals_js_onRequest } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/goals.js"
import { onRequest as __api_notifications_js_onRequest } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/notifications.js"
import { onRequest as __api_plaid_js_onRequest } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/plaid.js"
import { onRequest as __api_txncategory_js_onRequest } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/api/txncategory.js"
import { onRequestPost as __chat_js_onRequestPost } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/chat.js"
import { onRequestGet as __debug_js_onRequestGet } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/debug.js"
import { onRequestPost as __send_otp_js_onRequestPost } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/send-otp.js"
import { onRequestPost as __verify_otp_js_onRequestPost } from "/Users/afnannawaz/Documents/GitHub/Team11ProjectGithub/functions/verify-otp.js"

export const routes = [
    {
      routePath: "/api/finance",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_finance_js_onRequestGet],
    },
  {
      routePath: "/api/spending",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_spending_js_onRequestGet],
    },
  {
      routePath: "/api/stock",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_stock_js_onRequestGet],
    },
  {
      routePath: "/api/alerts",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_alerts_js_onRequest],
    },
  {
      routePath: "/api/auth",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_auth_js_onRequest],
    },
  {
      routePath: "/api/budget",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_budget_js_onRequest],
    },
  {
      routePath: "/api/chats",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_chats_js_onRequest],
    },
  {
      routePath: "/api/coinbase",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_coinbase_js_onRequest],
    },
  {
      routePath: "/api/goals",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_goals_js_onRequest],
    },
  {
      routePath: "/api/notifications",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_notifications_js_onRequest],
    },
  {
      routePath: "/api/plaid",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_plaid_js_onRequest],
    },
  {
      routePath: "/api/txncategory",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_txncategory_js_onRequest],
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