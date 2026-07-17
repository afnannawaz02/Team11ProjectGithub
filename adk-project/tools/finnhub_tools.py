"""
Finnhub financial data tools for the Gumdrop Financial Advisor agent.
Provides real-time stock quotes, company profiles, analyst recommendations,
market news, and earnings data via the Finnhub API.
"""

import os
import json
from datetime import datetime, timedelta
from typing import Optional
from ibm_watsonx_orchestrate.agent_builder.tools import tool, ToolPermission

FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")
FINNHUB_BASE    = "https://finnhub.io/api/v1"


async def _fh_get(path: str) -> dict:
    """Make a Finnhub API GET request."""
    import urllib.request
    url = f"{FINNHUB_BASE}{path}&token={FINNHUB_API_KEY}"
    try:
        with urllib.request.urlopen(url) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        return {"error": str(e)}


@tool(permission=ToolPermission.READ_ONLY)
async def get_stock_quote(ticker: str) -> dict:
    """
    Get a real-time stock quote for a given ticker symbol.
    Returns current price, daily change, percentage change, high, low, open, and previous close.

    Args:
        ticker: Stock ticker symbol (e.g. AAPL, MSFT, GOOGL)

    Returns:
        dict with keys: price, change, pct_change, high, low, open, prev_close
    """
    data = await _fh_get(f"/quote?symbol={ticker.upper()}")
    if "error" in data:
        return data
    return {
        "ticker":     ticker.upper(),
        "price":      data.get("c", 0),
        "change":     data.get("d", 0),
        "pct_change": data.get("dp", 0),
        "high":       data.get("h", 0),
        "low":        data.get("l", 0),
        "open":       data.get("o", 0),
        "prev_close": data.get("pc", 0),
    }


@tool(permission=ToolPermission.READ_ONLY)
async def get_company_profile(ticker: str) -> dict:
    """
    Get a company profile for a given ticker symbol.
    Returns company name, industry, market cap, exchange, and website.

    Args:
        ticker: Stock ticker symbol (e.g. AAPL)

    Returns:
        dict with keys: name, industry, sector, market_cap_millions, exchange, ipo_date
    """
    data = await _fh_get(f"/stock/profile2?symbol={ticker.upper()}")
    if "error" in data:
        return data
    return {
        "ticker":              ticker.upper(),
        "name":                data.get("name", ""),
        "industry":            data.get("finnhubIndustry", ""),
        "exchange":            data.get("exchange", ""),
        "market_cap_millions": data.get("marketCapitalization", 0),
        "ipo_date":            data.get("ipo", ""),
        "website":             data.get("weburl", ""),
        "country":             data.get("country", ""),
        "currency":            data.get("currency", "USD"),
    }


@tool(permission=ToolPermission.READ_ONLY)
async def get_analyst_recommendations(ticker: str) -> dict:
    """
    Get the latest analyst buy/hold/sell recommendations for a stock.
    Helps assess market sentiment and analyst consensus.

    Args:
        ticker: Stock ticker symbol

    Returns:
        dict with latest recommendation period, buy/hold/sell/strongBuy/strongSell counts
    """
    data = await _fh_get(f"/stock/recommendation?symbol={ticker.upper()}")
    if isinstance(data, list) and data:
        latest = data[0]
        total  = latest.get("buy", 0) + latest.get("hold", 0) + latest.get("sell", 0) + latest.get("strongBuy", 0) + latest.get("strongSell", 0)
        buy_pct = round((latest.get("buy", 0) + latest.get("strongBuy", 0)) / max(total, 1) * 100, 1)
        return {
            "ticker":      ticker.upper(),
            "period":      latest.get("period", ""),
            "strong_buy":  latest.get("strongBuy", 0),
            "buy":         latest.get("buy", 0),
            "hold":        latest.get("hold", 0),
            "sell":        latest.get("sell", 0),
            "strong_sell": latest.get("strongSell", 0),
            "total":       total,
            "buy_pct":     buy_pct,
            "consensus":   "Buy" if buy_pct > 55 else ("Sell" if buy_pct < 30 else "Hold"),
        }
    return {"error": "No recommendations available", "ticker": ticker.upper()}


@tool(permission=ToolPermission.READ_ONLY)
async def get_market_news(category: str = "general") -> list:
    """
    Get the latest financial market news headlines.

    Args:
        category: News category — 'general', 'forex', 'crypto', or 'merger'

    Returns:
        List of news articles with headline, summary, source, and URL
    """
    data = await _fh_get(f"/news?category={category}&minId=0")
    if isinstance(data, list):
        return [
            {
                "headline": a.get("headline", ""),
                "summary":  a.get("summary", "")[:200],
                "source":   a.get("source", ""),
                "url":      a.get("url", ""),
                "datetime": datetime.fromtimestamp(a.get("datetime", 0)).strftime("%Y-%m-%d") if a.get("datetime") else "",
            }
            for a in data[:8]
        ]
    return []


@tool(permission=ToolPermission.READ_ONLY)
async def get_company_news(ticker: str) -> list:
    """
    Get recent news articles for a specific company.

    Args:
        ticker: Stock ticker symbol

    Returns:
        List of news articles with headline, summary, source, and URL
    """
    to_date   = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    data = await _fh_get(f"/company-news?symbol={ticker.upper()}&from={from_date}&to={to_date}")
    if isinstance(data, list):
        return [
            {
                "headline": a.get("headline", ""),
                "summary":  a.get("summary", "")[:200],
                "source":   a.get("source", ""),
                "url":      a.get("url", ""),
                "datetime": datetime.fromtimestamp(a.get("datetime", 0)).strftime("%Y-%m-%d") if a.get("datetime") else "",
            }
            for a in data[:6]
        ]
    return []


@tool(permission=ToolPermission.READ_ONLY)
async def get_earnings_surprises(ticker: str) -> list:
    """
    Get recent earnings surprises (actual vs estimated EPS) for a company.
    Useful for evaluating a company's financial performance track record.

    Args:
        ticker: Stock ticker symbol

    Returns:
        List of quarterly earnings results with actual, estimate, and surprise pct
    """
    data = await _fh_get(f"/stock/earnings?symbol={ticker.upper()}&limit=4")
    if isinstance(data, list):
        return [
            {
                "period":         e.get("period", ""),
                "actual_eps":     e.get("actual", None),
                "estimated_eps":  e.get("estimate", None),
                "surprise_pct":   e.get("surprisePercent", None),
            }
            for e in data
        ]
    return []


@tool(permission=ToolPermission.READ_ONLY)
async def get_multiple_quotes(tickers: list[str]) -> dict:
    """
    Get real-time quotes for multiple stock tickers at once.
    Useful for portfolio valuation and comparison.

    Args:
        tickers: List of stock ticker symbols (max 10)

    Returns:
        dict mapping each ticker to its quote data
    """
    results = {}
    for ticker in tickers[:10]:
        q = await _fh_get(f"/quote?symbol={ticker.upper()}")
        if "error" not in q and q.get("c"):
            results[ticker.upper()] = {
                "price":      q.get("c", 0),
                "change":     q.get("d", 0),
                "pct_change": q.get("dp", 0),
            }
    return results
