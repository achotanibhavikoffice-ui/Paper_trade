"""In-app help assistant for navigating the Quantx paper-trading workspace."""

import logging
import re
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends

from app.config import settings
from app.routes.auth import get_current_user
from app.schemas import SupportChatAction, SupportChatInput, SupportChatResponse
from app.services.indian_api import IndianApiError, indian_api
from app.services.market_data import market_data
from app.services.market_knowledge import find_market_answer, market_knowledge
from app.services.support_knowledge import find_feature, project_knowledge

router = APIRouter(prefix="/api/support", tags=["support"])
logger = logging.getLogger("quantx.support")

ACTION_LABELS = {
    "what_if": "Open What-if Lab", "dashboard": "Back to overview", "explore": "Explore stocks",
    "stock": "Explore stocks", "quote_sources": "Explore stocks", "news": "Market news", "watchlist": "Open watchlist",
    "portfolio": "View portfolio", "holdings": "View holdings", "positions": "View positions",
    "orders": "Open orders", "stress": "Open Market Stress", "recovery": "Open Recovery Shield",
    "learn": "Open Learn", "notifications": "Open notifications", "account": "Practice account",
    "profile": "Open profile", "settings": "Open settings", "authentication": "Sign in and account setup", "workspace": "Back to overview",
}

IST = ZoneInfo("Asia/Kolkata")
NSE_OPEN = time(9, 15)
NSE_CLOSE = time(15, 30)
NO_FEATURE_ROUTE = "/__no-feature-match__"
OUT_OF_SCOPE_REPLY = (
    "This chatbot cannot help you with any other query other than market or Quantx."
)
ADVICE_REFUSAL = (
    "I cannot provide specific advice on whether you should buy or sell this stock, as I am an AI and not a SEBI-registered investment advisor.\n\n"
    "Stock investments carry market risks, and any financial decision should be made based on your own research or in consultation with a certified financial professional."
)


def is_recommendation_request(message: str) -> bool:
    """Block decisions and forecasts while allowing educational order-type questions."""
    text = " ".join(message.casefold().split())
    recommendation_phrases = (
        "should i buy", "should i sell", "what should i buy", "what should i sell",
        "which share", "which stock", "recommend a stock", "recommend a share",
        "best stock", "best share", "buy now", "sell now", "hold or sell", "buy or sell",
        "should i hold", "target price", "will it go up", "will it go down", "price prediction",
        "guaranteed return", "investment advice", "can i purchase", "should i purchase",
        "would you buy", "is it a good time to buy", "is this a good time to buy",
    )
    action_with_intent = re.search(
        r"\b(?:can|could|should|would|shall)\s+i\s+(?:buy|purchase|sell|short|hold)\b|"
        r"\b(?:recommend|suggest)\s+(?:that\s+i\s+)?(?:buy|purchase|sell|hold)\b|"
        r"\b(?:buy|purchase|sell)\s+[a-z0-9&.-]+\s+(?:now|today|tomorrow)\b",
        text,
    )
    prediction = re.search(r"\bwill\s+(?:\w+\s+){0,2}(?:rise|fall|increase|decrease)\b", text)
    return bool(action_with_intent or prediction or any(phrase in text for phrase in recommendation_phrases))


def is_market_overview_request(message: str) -> bool:
    text = " ".join(message.casefold().split())
    return any(phrase in text for phrase in (
        "market overview", "current market", "market status", "market open", "market closed",
        "market today", "nifty today", "sensex today", "how is the market", "market condition",
    ))


def is_in_scope(message: str) -> bool:
    """Classify the new message only; prior chat context must not widen the scope."""
    if find_feature(message, NO_FEATURE_ROUTE) or find_market_answer(message) or is_market_overview_request(message):
        return True
    text = message.casefold()
    market_words = (
        "market", "stock", "share", "equity", "nse", "bse", "nifty", "sensex", "ipo", "etf",
        "portfolio", "order", "trade", "trading", "chart", "candle", "volume", "liquidity", "margin",
        "p&l", "profit", "loss", "dividend", "valuation", "derivative", "option", "future", "risk",
    )
    project_words = ("quantx", "this page", "current page", "workspace", "dashboard", "setting", "watchlist")
    return any(word in text for word in (*market_words, *project_words))


def market_session_context() -> tuple[bool, datetime, datetime]:
    now = datetime.now(IST)
    open_now = now.weekday() < 5 and NSE_OPEN <= now.time() < NSE_CLOSE
    last_session = now
    if open_now:
        last_session = now - timedelta(days=1)
    elif now.weekday() < 5 and now.time() < NSE_OPEN:
        last_session = now - timedelta(days=1)
    while last_session.weekday() >= 5:
        last_session -= timedelta(days=1)
    # This identifies the normal weekday session; official exchange holidays can differ.
    last_close = last_session.replace(hour=15, minute=30, second=0, microsecond=0)
    return open_now, now, last_close


def compact_index_line(snapshot: dict) -> str:
    preferred = ("NIFTY 50", "SENSEX")
    selected = [row for name in preferred for row in snapshot.get("indices", []) if row.get("name", "").upper() == name]
    if not selected:
        selected = snapshot.get("indices", [])[:2]
    lines = []
    for row in selected:
        change = row.get("percent_change")
        change_text = f" ({change:+.2f}%)" if isinstance(change, (int, float)) else ""
        lines.append(f"{row['name']}: {row['price']:,.2f}{change_text}")
    return " · ".join(lines)


def market_overview_answer() -> str:
    is_open, now, last_close = market_session_context()
    try:
        index_line = compact_index_line(indian_api.indices())
    except IndianApiError:
        index_line = ""
    if not is_open:
        snapshot_note = f" Last verified index snapshot: {index_line}." if index_line else ""
        return (
            f"NSE cash market is currently closed. Normal trading ends at 3:30 PM IST; the latest regular-session reference is {last_close:%d %b %Y, 3:30 PM IST}. "
            f"{snapshot_note}"
            "In plain language: use the last available close or provider snapshot as historic reference, not as a live price. "
            "Exchange holidays can change the last trading date."
        )
    if index_line:
        return (
            f"NSE cash market is open ({now:%I:%M %p IST}). Verified index snapshot: {index_line}. "
            "Technical: the percentage is the move from the previous close. Plain language: positive means the index is above yesterday’s close; negative means below."
        )
    if market_data.connected:
        return (
            f"NSE cash market is open ({now:%I:%M %p IST}), but a verified index snapshot is unavailable right now. "
            "Technical: the live feed is connected but no index value is cached. Plain language: wait for the next update before judging the market’s direction."
        )
    return (
        f"NSE cash market is open ({now:%I:%M %p IST}), but Quantx cannot verify a current market snapshot because its data provider is unavailable. "
        "Technical: no validated quote source is connected. Plain language: the app should not guess today’s market level."
    )


def suggested_action(message: str, feature=None) -> list[SupportChatAction]:
    feature = find_feature(message, NO_FEATURE_ROUTE) or feature
    if feature is None or feature.key == "authentication":
        return []
    return [SupportChatAction(label=ACTION_LABELS[feature.key], path=feature.path)]


def guide_answer(message: str, page: str, feature=None) -> str:
    if is_recommendation_request(message):
        return ADVICE_REFUSAL
    if not is_in_scope(message):
        return OUT_OF_SCOPE_REPLY
    if is_market_overview_request(message):
        return market_overview_answer()
    market_answer = find_market_answer(message)
    if market_answer:
        return (
            f"Technical view: {market_answer}\n\n"
            "Plain language: this helps you understand the term, but it is not a signal to buy or sell. Quantx orders and balances are simulated."
        )
    feature = find_feature(message, NO_FEATURE_ROUTE) or feature
    if feature is None and any(term in message.casefold() for term in ("this page", "current page", "where do i", "how do i use", "explain this")):
        feature = find_feature("", page)
    if feature:
        if feature.key == "what_if" and any(term in message.casefold() for term in ("example", "for instance", "show me")):
            return (
                f"Technical view: {feature.explanation}\n\n"
                "Plain language: enter a stock, amount, and hypothetical price move to see a practice outcome. It does not change your account."
            )
        return (
            f"Technical view: {feature.explanation}\n\n"
            f"Plain language: this is the {feature.title} area of Quantx; it helps you practise and understand the feature without placing a real trade."
        )
    return (
        f"You’re viewing {page}. I can explain any workspace page, chart label, control, or account feature. "
        "For example, ask ‘What does this chart show?’, ‘How do limit orders work here?’, or ‘Explain What-if Lab.’ "
        "I can also explain common market terms such as indices, liquidity, valuation, chart patterns, and risk. "
        "Quantx is a paper-trading app: orders and account balances are simulated."
    )


def extract_output_text(payload: dict) -> str:
    pieces: list[str] = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                pieces.append(content["text"])
    return "\n".join(pieces).strip()


@router.post("/chat", response_model=SupportChatResponse)
async def support_chat(payload: SupportChatInput, _user=Depends(get_current_user)) -> SupportChatResponse:
    page = payload.page.strip() or "/dashboard"
    message_feature = find_feature(payload.message, NO_FEATURE_ROUTE)
    related_feature = message_feature
    if related_feature is None:
        for item in reversed(payload.history):
            if item.role == "user" and (related_feature := find_feature(item.content, NO_FEATURE_ROUTE)) is not None:
                break
    current_page_feature = find_feature("", page)
    if is_recommendation_request(payload.message):
        return SupportChatResponse(answer=ADVICE_REFUSAL, mode="guide", actions=[])
    if not is_in_scope(payload.message):
        return SupportChatResponse(answer=OUT_OF_SCOPE_REPLY, mode="guide", actions=[])
    if is_market_overview_request(payload.message):
        return SupportChatResponse(answer=market_overview_answer(), mode="guide", actions=[])
    action = suggested_action(payload.message, message_feature)
    page_context = f"Current page: {current_page_feature.title}. {current_page_feature.explanation}" if current_page_feature else f"Current page path: {page}."
    if not settings.openai_api_key:
        return SupportChatResponse(answer=guide_answer(payload.message, page, related_feature), mode="guide", actions=action)

    # Keep unrelated earlier messages out of the model context as well as the current-turn gate.
    history = [
        {"role": item.role, "content": item.content}
        for item in payload.history[-10:]
        if item.role == "assistant" or is_in_scope(item.content)
    ]
    history.append({"role": "user", "content": payload.message})
    instructions = (
        "You are Quantx Guide, a concise in-app support assistant for Quantx, a paper-trading workspace for NSE equities. "
        "Only answer questions about Quantx and Indian-market education. If a question is outside that scope, reply exactly: 'This chatbot cannot help you with any other query other than market or Quantx.' "
        f"Never recommend a share, give a buy/sell/hold decision, select a stock, predict a price, or provide personalized investment advice. For those requests reply exactly: '{ADVICE_REFUSAL}' "
        "For allowed answers, use at most 120 words and explain the technical term first, then add one short sentence in plain language for a beginner. "
        "Answer questions about every workspace page and general market education using the project and market knowledge below. "
        "Explain controls and terms in practical steps; "
        "when asked about the current page, use the current-page reference rather than giving generic navigation advice. "
        f"{page_context}\n\nPROJECT KNOWLEDGE:\n{project_knowledge()}\n\nMARKET KNOWLEDGE:\n{market_knowledge()}\n\n"
        "Market quotes can be delayed snapshots or practice data depending on the source label. Never claim prices are real-time unless the interface says so. "
        "Do not place trades, change account data, request passwords or API keys, or give personalized financial recommendations. "
        "For requests about today's prices, news, or market direction, use current verified data only if it is supplied in context; "
        "otherwise say you cannot verify current conditions and explain where to check. Market rules and settlement details can change, "
        "so direct users to current NSE/SEBI or broker material for exact requirements. Use clear explanations and mention simulated features. "
        "If the guide does not document something, say so instead of inventing it."
    )
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={"model": settings.openai_model, "instructions": instructions, "input": history,
                      "max_output_tokens": 220, "store": False},
            )
        response.raise_for_status()
        answer = extract_output_text(response.json())
        if answer:
            return SupportChatResponse(answer=answer, mode="ai", actions=action)
    except (httpx.HTTPError, ValueError):
        logger.warning("OpenAI support reply unavailable; using built-in help guide")

    return SupportChatResponse(answer=guide_answer(payload.message, page, related_feature), mode="guide", actions=action)
