# NOVA AI assistant production hardening

## Scope
Complete the existing read-only assistant without changing financial calculations, sync, native security, routes, or the visual system.

## Implementation
1. **Secure the server boundary**
   - Require an authenticated session for every assistant request.
   - Stop trusting client-supplied financial metrics: load the signed-in user’s saved state server-side, validate it, and derive the existing aggregate-only AI snapshot there.
   - Keep raw accounts, transaction records, names, notes, identifiers, credentials, and secrets out of prompts and browser responses.
   - Validate questions, locale, and complete bounded conversation history; reject malformed and oversized input.

2. **Harden model calls**
   - Preserve `openai/gpt-6-astra` on the streaming Responses API with server-only credentials, stateless history, and low reasoning.
   - Add bounded server-side abuse controls per authenticated user.
   - Classify provider failures so only retryable rate-limit/server failures offer retry; surface safe localized messages for authentication, credits, configuration, validation, and provider errors.
   - Do not add artificial timeouts; allow explicit user retry instead.

3. **Complete the assistant experience**
   - Send the full bounded conversation on each turn and keep failed user input recoverable.
   - Render assistant Markdown safely, announce loading/errors, disable duplicate submissions, add Retry, and label navigation/actions accessibly.
   - Add a localized privacy and educational-information disclaimer, plus honest empty-data behavior.
   - Preserve the current NOVA visual language and structured read-only navigation suggestions.

4. **Verification**
   - Add focused tests for aggregate-data privacy, input validation, auth enforcement, rate limiting, malformed cloud state, provider failures, and successful responses.
   - Exercise the authenticated happy path end-to-end when a test session is available; otherwise verify the unauthorized path and document the blocked authenticated browser check.
   - Run all tests, type checks, translation checks, and the production build.

## Technical notes
- Reuse the existing authenticated server middleware and the existing user-data row; no new financial tables or write-capable AI tools.
- The server will reconstruct the established financial context and `AiSnapshot`; the browser sends only the question, locale, and conversation transcript.
- Rate limiting will be lightweight and server-side, appropriate to the current stack, without introducing a separate service.
