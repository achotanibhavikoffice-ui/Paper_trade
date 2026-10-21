"""In-app help assistant for navigating the Quantx paper-trading workspace."""

import logging

import httpx
from fastapi import APIRouter, Depends

from app.config import settings
from app.routes.auth import get_current_user
from app.schemas import SupportChatAction, SupportChatInput, SupportChatResponse
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
    "profile": "Profile & settings", "authentication": "Sign in and account setup", "workspace": "Back to overview",
}


def suggested_action(message: str, feature=None) -> list[SupportChatAction]:
    feature = find_feature(message) or feature
    if feature is None or feature.key == "authentication":
        return []
    return [SupportChatAction(label=ACTION_LABELS[feature.key], path=feature.path)]


def guide_answer(message: str, page: str, feature=None) -> str:
    market_answer = find_market_answer(message)
    if market_answer:
        return (
            f"{market_answer}\n\n"
            "This is general market education, not a prediction or personalized investment recommendation. "
            "Quantx's account and order activity are simulated."
        )
    feature = find_feature(message) or feature
    if feature is None and any(term in message.casefold() for term in ("this page", "current page", "where do i", "how do i use", "explain this")):
        feature = find_feature("", page)
    if feature:
        if feature.key == "what_if" and any(term in message.casefold() for term in ("example", "for instance", "show me")):
            return (
                f"{feature.title}\n{feature.explanation}\n\n"
                "Example: in the Stock tab, enter TCS and ₹10,000, choose a +10% hypothetical move, then run the simulation. "
                "The result shows the projected value and P&L under those assumptions; it does not change your account."
            )
        return f"{feature.title}\n{feature.explanation}"
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
    related_feature = find_feature(payload.message)
    if related_feature is None:
        for item in reversed(payload.history):
            if item.role == "user" and (related_feature := find_feature(item.content)) is not None:
                break
    current_page_feature = find_feature("", page)
    action = suggested_action(payload.message, related_feature)
    page_context = f"Current page: {current_page_feature.title}. {current_page_feature.explanation}" if current_page_feature else f"Current page path: {page}."
    if not settings.openai_api_key:
        return SupportChatResponse(answer=guide_answer(payload.message, page, related_feature), mode="guide", actions=action)

    history = [{"role": item.role, "content": item.content} for item in payload.history[-10:]]
    history.append({"role": "user", "content": payload.message})
    instructions = (
        "You are Quantx Guide, the concise in-app support assistant for Quantx, a paper-trading workspace for NSE equities. "
        "Answer questions about every workspace page and general market education using the project and market knowledge below. "
        "Explain common equity-market terminology at an intermediate level: define the term, give a practical example or explain how concepts relate, "
        "and state important limitations. Handle ordinary market questions even when they are unrelated to the current page. "
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
                      "max_output_tokens": 450, "store": False},
            )
        response.raise_for_status()
        answer = extract_output_text(response.json())
        if answer:
            return SupportChatResponse(answer=answer, mode="ai", actions=action)
    except (httpx.HTTPError, ValueError):
        logger.warning("OpenAI support reply unavailable; using built-in help guide")

    return SupportChatResponse(answer=guide_answer(payload.message, page, related_feature), mode="guide", actions=action)
