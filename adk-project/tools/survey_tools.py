"""
Cloudflare D1 survey data tools for the Gumdrop Financial Advisor agent.
Reads user financial profile from the D1 database to personalise advice.

These tools provide the agent with the user's goals, risk tolerance,
income, savings rate, and other profile data collected via the questionnaire.
"""

import os
from ibm_watsonx_orchestrate.agent_builder.tools import tool, ToolPermission


@tool(permission=ToolPermission.READ_ONLY)
async def get_financial_profile(user_id: str = "demo") -> dict:
    """
    Get the user's financial profile from the Candyland Bank questionnaire.
    Returns goals, risk tolerance, time horizon, income, savings, and preferences.

    This data was collected during onboarding and is used to personalise
    all financial recommendations.

    Args:
        user_id: The user's account identifier

    Returns:
        dict with complete financial profile including goals, risk, horizon, income, savings
    """
    # Demo profile — in production this queries:
    # SELECT * FROM profiles WHERE user_id = ?  (D1 DB binding)
    return {
        "goals":               ["retirement", "home", "wealth"],
        "risk_tolerance":      "moderate",
        "time_horizon":        "long",
        "annual_income":       85000,
        "monthly_savings":     1200,
        "emergency_fund":      "3-6 months",
        "current_investments": ["401k", "index_funds"],
        "employment_status":   "full-time",
        "marital_status":      "single",
        "credit_score":        "750-799",
        "preferences":         ["esg", "index_funds"],
        "age_bracket":         "25-34",
    }


@tool(permission=ToolPermission.READ_ONLY)
async def get_financial_goals_analysis(user_id: str = "demo") -> dict:
    """
    Analyse whether the user is on track for each of their stated financial goals.
    Combines profile data with current savings and portfolio to assess goal progress.

    Args:
        user_id: The user's account identifier

    Returns:
        dict with goal-by-goal analysis and on-track status
    """
    # These calculations would normally use live account data from Plaid + profile
    profile = {
        "annual_income":  85000,
        "monthly_savings": 1200,
        "net_worth":      74500,
        "age":            29,
    }

    goals = [
        {
            "goal":         "Retirement",
            "target":       "$1,500,000 by age 65",
            "current_pace": "$1,080,000 at current savings rate",
            "shortfall":    "$420,000",
            "on_track":     False,
            "action":       "Increase monthly retirement contribution by $300/month to close gap.",
        },
        {
            "goal":         "Home Purchase",
            "target":       "$80,000 down payment in 5 years",
            "current_pace": "$72,000 projected",
            "shortfall":    "$8,000",
            "on_track":     False,
            "action":       "Save an additional $134/month to reach your down payment goal.",
        },
        {
            "goal":         "Wealth Growth",
            "target":       "10% annual portfolio growth",
            "current_pace": "8.3% average return",
            "shortfall":    "1.7% return gap",
            "on_track":     False,
            "action":       "Consider shifting 10% of bonds to a diversified equity ETF.",
        },
    ]

    return {
        "profile_summary": profile,
        "goals":           goals,
        "overall_score":   62,
        "summary":         "You are partially on track. Increasing savings by $434/month would put all three goals on track.",
    }


@tool(permission=ToolPermission.READ_ONLY)
async def get_financial_health_score(user_id: str = "demo") -> dict:
    """
    Calculate a comprehensive financial health score (0-100) based on all available data.
    Scores across emergency fund, debt ratio, savings rate, diversification, and goal progress.

    Args:
        user_id: The user's account identifier

    Returns:
        dict with overall score, component scores, and improvement recommendations
    """
    components = {
        "emergency_fund":    {"score": 75, "max": 100, "label": "Emergency Fund",     "detail": "3 months of expenses saved. Target: 6 months."},
        "debt_ratio":        {"score": 88, "max": 100, "label": "Debt-to-Income",     "detail": "Debt is 14% of income — excellent. Keep it under 20%."},
        "savings_rate":      {"score": 60, "max": 100, "label": "Savings Rate",        "detail": "Saving 21.8% of income. Great! Target: 20%+."},
        "diversification":   {"score": 68, "max": 100, "label": "Diversification",    "detail": "Technology sector overweight at 61% of equities."},
        "goal_progress":     {"score": 62, "max": 100, "label": "Goal Progress",       "detail": "2 of 3 goals need higher contributions."},
        "net_worth_growth":  {"score": 72, "max": 100, "label": "Net Worth Trajectory","detail": "Net worth growing 12% year-over-year — above average."},
    }

    overall = round(sum(c["score"] for c in components.values()) / len(components))

    grade = "A" if overall >= 85 else "B" if overall >= 70 else "C" if overall >= 55 else "D"

    top_improvements = [
        "Increase emergency fund from 3 to 6 months of expenses.",
        "Reduce technology sector concentration by adding exposure to healthcare and consumer staples.",
        "Boost retirement contributions by $300/month to stay on track.",
    ]

    return {
        "overall_score":     overall,
        "grade":             grade,
        "components":        components,
        "top_improvements":  top_improvements,
        "next_review_date":  "90 days",
    }
