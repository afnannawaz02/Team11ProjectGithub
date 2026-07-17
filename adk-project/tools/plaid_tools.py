"""
Plaid financial data tools for the Gumdrop Financial Advisor agent.
Provides bank account balances, transaction history, and spending analysis.

In production, user Plaid access tokens are fetched from the D1 database.
Currently returns realistic demo data for development and demonstration.
"""

import os
import json
from datetime import datetime, timedelta
from typing import Optional
from ibm_watsonx_orchestrate.agent_builder.tools import tool, ToolPermission


@tool(permission=ToolPermission.READ_ONLY)
async def get_bank_accounts(user_id: str = "demo") -> list:
    """
    Get the user's linked bank account balances from Plaid.
    Includes checking, savings, investment, and credit accounts.

    Args:
        user_id: The user's account identifier

    Returns:
        List of accounts with name, type, and current balance
    """
    # Demo data — in production: fetch Plaid /accounts/get with user's access_token
    accounts = [
        {"id": "checking-1", "name": "Chase Checking",     "type": "checking",   "balance": 6842.50},
        {"id": "savings-1",  "name": "Chase Savings",      "type": "savings",    "balance": 18500.00},
        {"id": "credit-1",   "name": "Chase Sapphire",     "type": "credit",     "balance": -1247.33},
        {"id": "invest-1",   "name": "Fidelity Brokerage", "type": "investment", "balance": 34280.00},
    ]
    total_assets = sum(a["balance"] for a in accounts if a["balance"] > 0)
    total_debt   = abs(sum(a["balance"] for a in accounts if a["balance"] < 0))
    return {
        "accounts":     accounts,
        "total_assets": round(total_assets, 2),
        "total_debt":   round(total_debt, 2),
        "net_worth":    round(total_assets - total_debt, 2),
    }


@tool(permission=ToolPermission.READ_ONLY)
async def get_spending_summary(user_id: str = "demo", days: int = 30) -> dict:
    """
    Get a spending summary for the past N days using Plaid transaction data.
    Breaks down spending by category, identifies top expenses, and calculates savings rate.

    Args:
        user_id: The user's account identifier
        days: Number of days to analyze (default: 30)

    Returns:
        dict with income, total_expenses, savings, savings_rate, and category_breakdown
    """
    # Demo spending data
    categories = {
        "Food & Dining":    {"amount": 847.32,  "transactions": 14},
        "Shopping":         {"amount": 423.18,  "transactions": 6},
        "Transportation":   {"amount": 218.45,  "transactions": 9},
        "Utilities":        {"amount": 254.98,  "transactions": 3},
        "Entertainment":    {"amount": 89.50,   "transactions": 3},
        "Health":           {"amount": 58.00,   "transactions": 2},
        "Subscriptions":    {"amount": 189.93,  "transactions": 8},
        "Travel":           {"amount": 0,       "transactions": 0},
    }

    income        = 5500.00
    total_expenses = sum(v["amount"] for v in categories.values())
    savings       = income - total_expenses
    savings_rate  = round((savings / income) * 100, 1)

    return {
        "period_days":     days,
        "income":          income,
        "total_expenses":  round(total_expenses, 2),
        "savings":         round(savings, 2),
        "savings_rate_pct": savings_rate,
        "category_breakdown": [
            {"category": k, "amount": v["amount"], "transactions": v["transactions"],
             "pct": round(v["amount"] / total_expenses * 100, 1)}
            for k, v in categories.items() if v["amount"] > 0
        ],
        "top_category": max(categories.items(), key=lambda x: x[1]["amount"])[0],
    }


@tool(permission=ToolPermission.READ_ONLY)
async def get_recent_transactions(user_id: str = "demo", limit: int = 20) -> list:
    """
    Get the most recent bank transactions for a user.
    Useful for reviewing spending patterns and identifying unusual charges.

    Args:
        user_id: The user's account identifier
        limit: Maximum number of transactions to return (default: 20)

    Returns:
        List of transactions with date, description, category, and amount
    """
    now = datetime.now()
    txns = [
        {"date": (now - timedelta(days=1)).strftime("%Y-%m-%d"),  "desc": "Whole Foods Market",    "cat": "Food & Dining",  "amount": -92.47},
        {"date": (now - timedelta(days=2)).strftime("%Y-%m-%d"),  "desc": "Netflix",               "cat": "Subscriptions",  "amount": -22.99},
        {"date": (now - timedelta(days=3)).strftime("%Y-%m-%d"),  "desc": "Amazon",                "cat": "Shopping",       "amount": -67.84},
        {"date": (now - timedelta(days=4)).strftime("%Y-%m-%d"),  "desc": "Uber",                  "cat": "Transportation", "amount": -18.50},
        {"date": (now - timedelta(days=5)).strftime("%Y-%m-%d"),  "desc": "Starbucks",             "cat": "Food & Dining",  "amount": -6.75},
        {"date": (now - timedelta(days=6)).strftime("%Y-%m-%d"),  "desc": "ConEd Electric",        "cat": "Utilities",      "amount": -112.33},
        {"date": (now - timedelta(days=7)).strftime("%Y-%m-%d"),  "desc": "Spotify",               "cat": "Subscriptions",  "amount": -10.99},
        {"date": (now - timedelta(days=8)).strftime("%Y-%m-%d"),  "desc": "Salary Deposit",        "cat": "Income",         "amount": 4850.00},
        {"date": (now - timedelta(days=9)).strftime("%Y-%m-%d"),  "desc": "Adobe Creative Cloud",  "cat": "Subscriptions",  "amount": -54.99},
        {"date": (now - timedelta(days=10)).strftime("%Y-%m-%d"), "desc": "Target",                "cat": "Shopping",       "amount": -78.20},
        {"date": (now - timedelta(days=11)).strftime("%Y-%m-%d"), "desc": "Shell Gas Station",     "cat": "Transportation", "amount": -62.50},
        {"date": (now - timedelta(days=12)).strftime("%Y-%m-%d"), "desc": "Gym Membership",        "cat": "Subscriptions",  "amount": -45.00},
        {"date": (now - timedelta(days=14)).strftime("%Y-%m-%d"), "desc": "Trader Joes",           "cat": "Food & Dining",  "amount": -61.18},
        {"date": (now - timedelta(days=15)).strftime("%Y-%m-%d"), "desc": "Verizon Wireless",      "cat": "Utilities",      "amount": -85.00},
        {"date": (now - timedelta(days=16)).strftime("%Y-%m-%d"), "desc": "CVS Pharmacy",          "cat": "Health",         "amount": -28.40},
        {"date": (now - timedelta(days=18)).strftime("%Y-%m-%d"), "desc": "Best Buy",              "cat": "Shopping",       "amount": -149.99},
        {"date": (now - timedelta(days=19)).strftime("%Y-%m-%d"), "desc": "Uber Eats",             "cat": "Food & Dining",  "amount": -38.75},
        {"date": (now - timedelta(days=21)).strftime("%Y-%m-%d"), "desc": "Hulu",                  "cat": "Subscriptions",  "amount": -17.99},
        {"date": (now - timedelta(days=22)).strftime("%Y-%m-%d"), "desc": "Freelance Payment",     "cat": "Income",         "amount": 650.00},
        {"date": (now - timedelta(days=24)).strftime("%Y-%m-%d"), "desc": "AMC Theatres",          "cat": "Entertainment",  "amount": -32.00},
    ]
    return txns[:limit]


@tool(permission=ToolPermission.READ_ONLY)
async def get_subscriptions(user_id: str = "demo") -> dict:
    """
    Detect and list all recurring subscription charges from bank transactions.
    Identifies services that can be cancelled to save money.

    Args:
        user_id: The user's account identifier

    Returns:
        dict with list of subscriptions and total monthly cost
    """
    subscriptions = [
        {"service": "Netflix",              "amount": 22.99, "category": "Entertainment"},
        {"service": "Adobe Creative Cloud", "amount": 54.99, "category": "Productivity"},
        {"service": "Gym Membership",       "amount": 45.00, "category": "Health"},
        {"service": "Spotify",              "amount": 10.99, "category": "Entertainment"},
        {"service": "Hulu",                 "amount": 17.99, "category": "Entertainment"},
        {"service": "Amazon Prime",         "amount": 14.99, "category": "Shopping"},
        {"service": "ChatGPT Plus",         "amount": 20.00, "category": "Productivity"},
        {"service": "iCloud Storage",       "amount": 2.99,  "category": "Storage"},
    ]
    total = sum(s["amount"] for s in subscriptions)
    annual = round(total * 12, 2)

    entertainment = [s for s in subscriptions if s["category"] == "Entertainment"]
    entertainment_total = sum(s["amount"] for s in entertainment)

    return {
        "subscriptions":          subscriptions,
        "total_monthly":          round(total, 2),
        "total_annual":           annual,
        "entertainment_monthly":  round(entertainment_total, 2),
        "cancellation_potential": round(entertainment_total * 0.5, 2),
    }


@tool(permission=ToolPermission.READ_ONLY)
async def get_income_vs_expenses(user_id: str = "demo") -> dict:
    """
    Compare income vs expenses over the last 3 months to identify trends.

    Args:
        user_id: The user's account identifier

    Returns:
        dict with monthly income, expenses, savings, and trend analysis
    """
    now = datetime.now()
    monthly = [
        {
            "month":    (now - timedelta(days=60)).strftime("%b %Y"),
            "income":   5500.00,
            "expenses": 4180.20,
            "savings":  1319.80,
        },
        {
            "month":    (now - timedelta(days=30)).strftime("%b %Y"),
            "income":   5500.00,
            "expenses": 4395.43,
            "savings":  1104.57,
        },
        {
            "month":    now.strftime("%b %Y"),
            "income":   6150.00,
            "expenses": 4082.15,
            "savings":  2067.85,
        },
    ]

    avg_savings_rate = round(sum(m["savings"] / m["income"] * 100 for m in monthly) / len(monthly), 1)

    return {
        "monthly":           monthly,
        "avg_savings_rate":  avg_savings_rate,
        "trend":             "improving" if monthly[-1]["savings"] > monthly[0]["savings"] else "declining",
        "recommended_rate":  20.0,
        "on_track":          avg_savings_rate >= 20.0,
    }
