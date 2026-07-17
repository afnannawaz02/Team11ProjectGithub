"""
Coinbase cryptocurrency portfolio tools for the Gumdrop Financial Advisor agent.
Provides crypto holdings, portfolio valuation, and allocation analysis.

In production these would use the Coinbase Advanced Trade API with OAuth.
Currently returns realistic demo data ready for live integration.
"""

import os
from datetime import datetime, timedelta
from ibm_watsonx_orchestrate.agent_builder.tools import tool, ToolPermission


@tool(permission=ToolPermission.READ_ONLY)
async def get_crypto_portfolio(user_id: str = "demo") -> dict:
    """
    Get the user's full cryptocurrency portfolio from Coinbase.
    Returns holdings, current values, and allocation percentages.

    Args:
        user_id: The user's account identifier

    Returns:
        dict with holdings list, total_value, and allocation breakdown
    """
    # Demo holdings — in production: call Coinbase Advanced Trade /api/v3/brokerage/portfolios
    # with user's OAuth token from D1 database
    holdings = [
        {"symbol": "BTC",  "name": "Bitcoin",      "qty": 0.1842,  "price": 67450.00},
        {"symbol": "ETH",  "name": "Ethereum",     "qty": 2.340,   "price": 3820.00},
        {"symbol": "SOL",  "name": "Solana",       "qty": 18.50,   "price": 185.00},
        {"symbol": "USDC", "name": "USD Coin",     "qty": 524.80,  "price": 1.00},
    ]

    for h in holdings:
        h["value"]   = round(h["qty"] * h["price"], 2)
        h["pct_24h"] = {"BTC": 2.4, "ETH": 1.8, "SOL": -3.2, "USDC": 0.0}.get(h["symbol"], 0)

    total = sum(h["value"] for h in holdings)
    for h in holdings:
        h["allocation_pct"] = round(h["value"] / total * 100, 1) if total else 0

    # Cost basis for P&L (demo)
    cost_basis = {"BTC": 52000 * 0.1842, "ETH": 2900 * 2.34, "SOL": 120 * 18.5, "USDC": 524.80}
    unrealized_gain = sum(h["value"] - cost_basis.get(h["symbol"], h["value"]) for h in holdings)

    return {
        "holdings":        holdings,
        "total_value":     round(total, 2),
        "unrealized_gain": round(unrealized_gain, 2),
        "unrealized_pct":  round(unrealized_gain / max(sum(cost_basis.values()), 1) * 100, 1),
        "btc_dominance":   round(next(h["value"] for h in holdings if h["symbol"] == "BTC") / total * 100, 1) if total else 0,
        "stable_pct":      round(next(h["value"] for h in holdings if h["symbol"] == "USDC") / total * 100, 1) if total else 0,
    }


@tool(permission=ToolPermission.READ_ONLY)
async def get_crypto_performance(user_id: str = "demo") -> dict:
    """
    Get the performance history of the user's crypto portfolio over the past 30 days.
    Useful for evaluating crypto exposure and volatility.

    Args:
        user_id: The user's account identifier

    Returns:
        dict with daily portfolio values and performance metrics
    """
    now   = datetime.now()
    total = 16840.00  # current portfolio value
    # Simulate 30 days of history with typical crypto volatility
    history = []
    val = total * 0.82
    for i in range(30):
        d = now - timedelta(days=29 - i)
        # Deterministic growth with volatility
        delta = total * 0.006 * ((i % 5 - 2) * 0.3 + 0.2)
        val   = max(val + delta, 1)
        history.append({
            "date":  d.strftime("%Y-%m-%d"),
            "value": round(val, 2),
        })
    history[-1]["value"] = total

    return {
        "history":      history,
        "start_value":  history[0]["value"],
        "end_value":    total,
        "gain_30d":     round(total - history[0]["value"], 2),
        "gain_pct_30d": round((total - history[0]["value"]) / history[0]["value"] * 100, 1),
        "max_value":    max(h["value"] for h in history),
        "min_value":    min(h["value"] for h in history),
        "volatility":   "High",  # crypto standard
    }


@tool(permission=ToolPermission.READ_ONLY)
async def assess_crypto_risk(user_id: str = "demo", total_portfolio_value: float = 100000.0) -> dict:
    """
    Assess the user's cryptocurrency risk exposure relative to their total portfolio.
    Provides recommendations on crypto allocation based on risk tolerance.

    Args:
        user_id: The user's account identifier
        total_portfolio_value: Total portfolio value including all asset classes

    Returns:
        dict with risk assessment, allocation percentage, and recommendations
    """
    crypto_value = 16840.00
    crypto_pct   = round(crypto_value / total_portfolio_value * 100, 1) if total_portfolio_value else 0

    # BTC is ~73% of crypto, which is relatively concentrated
    btc_value    = 12424.29
    btc_pct_of_portfolio = round(btc_value / total_portfolio_value * 100, 1) if total_portfolio_value else 0

    risk_level = "Low" if crypto_pct < 5 else "Moderate" if crypto_pct < 15 else "High" if crypto_pct < 30 else "Very High"

    recommendations = []
    if crypto_pct > 20:
        recommendations.append(f"Crypto represents {crypto_pct}% of your portfolio — consider trimming to 10-15% to reduce volatility risk.")
    if btc_pct_of_portfolio > 10:
        recommendations.append("Bitcoin alone is a significant concentration. Consider diversifying within crypto to ETH, SOL, or stable coins.")
    if crypto_pct < 3:
        recommendations.append("Your crypto allocation is minimal. A 3-5% allocation can add return potential without excessive risk.")

    return {
        "crypto_value":              crypto_value,
        "crypto_pct":                crypto_pct,
        "btc_pct_of_portfolio":      btc_pct_of_portfolio,
        "risk_level":                risk_level,
        "recommended_max_pct":       15.0,
        "is_overexposed":            crypto_pct > 15,
        "recommendations":           recommendations,
    }
