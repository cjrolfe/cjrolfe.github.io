"""
Factory function for AI provider creation with backward compatibility.
"""
from typing import Optional
import os
from .base import AIProvider, AIRequest, AIResponse
from .openai_provider import OpenAIProvider
from .anthropic_provider import AnthropicProvider


def create_provider() -> Optional[AIProvider]:
    """
    Factory function to create the appropriate AI provider.
    Returns None if no provider configured (will use fallback).

    Provider selection logic:
    1. If AI_PROVIDER=none → return None (skip AI)
    2. If AI_PROVIDER=anthropic → use Anthropic (requires ANTHROPIC_API_KEY)
    3. If AI_PROVIDER=openai → use OpenAI (requires OPENAI_API_KEY)
    4. If AI_PROVIDER not set and OPENAI_API_KEY exists → use OpenAI (legacy mode)
    5. Otherwise → return None (use fallback)
    """
    provider_name = os.getenv("AI_PROVIDER", "").lower().strip()

    # Explicit "none" disables AI
    if provider_name == "none":
        return None

    # Anthropic provider
    if provider_name == "anthropic":
        api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise ValueError("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY not set")
        model = os.getenv("ANTHROPIC_MODEL", "").strip()
        return AnthropicProvider(api_key, model or None)

    # OpenAI provider (explicit or legacy mode)
    if provider_name == "openai" or (not provider_name and os.getenv("OPENAI_API_KEY")):
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            return None
        model = os.getenv("OPENAI_MODEL", "").strip()
        return OpenAIProvider(api_key, model or None)

    # Unknown provider
    if provider_name:
        raise ValueError(f"Unknown AI_PROVIDER: {provider_name}")

    # No provider configured
    return None


# Export for easy imports
__all__ = ["create_provider", "AIProvider", "AIRequest", "AIResponse"]
