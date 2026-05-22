module RateLimiter

using Dates

export check_request, record_usage, usage_status, RateLimitResult

# ── Configuration ──
# Config values are read from environment variables in `__init__()` — i.e. at module
# load time in each running process — NOT at module-load/precompile time. A top-level
# `const X = get(ENV, ...)` would be evaluated during precompilation and baked into the
# precompile cache, freezing it: later changes to the environment (or .env) would
# silently have no effect. Reading inside `__init__()` ensures every server start picks
# up the current environment.
mutable struct Config
    daily_token_budget::Int
    rate_limit_requests::Int
    rate_limit_window::Int
end
const CONFIG = Config(5_000_000, 5, 60)   # defaults; overwritten by __init__()

# UTC date key, e.g. "2026-05-22". Used to detect day boundaries for the token budget.
_utc_day_key() = string(Date(now(UTC)))

# ── Shared mutable state ──
# Genie/HTTP.jl handle each request in its own task, so every access to the state
# below must happen inside `lock(LOCK) do ... end`.
const LOCK = ReentrantLock()

# Unix-epoch timestamps of admitted requests, trimmed to the active window on each check.
const REQUEST_LOG = Float64[]

mutable struct DailyUsage
    day::String     # UTC date key the counter belongs to
    tokens::Int     # tokens consumed so far on that day
end
const USAGE = DailyUsage("", 0)   # day populated by __init__()

"""
    RateLimitResult(allowed, status, message)

Outcome of a `check_request` pre-flight check.

- `allowed`: whether the request may proceed
- `status`: HTTP status to return (200 if allowed, 429 if rejected)
- `message`: user-facing error text (empty if allowed)
"""
struct RateLimitResult
    allowed::Bool
    status::Int
    message::String
end

"""
    __init__()

Runs once per process when the module is loaded (after the server has loaded its
`.env` file). Reads configuration from the environment and initialises runtime state.

Env vars (defaults shown):
- `LLM_DAILY_TOKEN_BUDGET` (5000000): tokens allowed per UTC day
- `LLM_RATE_LIMIT_REQUESTS` (5): max requests per window
- `LLM_RATE_LIMIT_WINDOW_SECONDS` (60): sliding-window length in seconds
"""
function __init__()
    CONFIG.daily_token_budget  = parse(Int, get(ENV, "LLM_DAILY_TOKEN_BUDGET", "5000000"))
    CONFIG.rate_limit_requests = parse(Int, get(ENV, "LLM_RATE_LIMIT_REQUESTS", "5"))
    CONFIG.rate_limit_window   = parse(Int, get(ENV, "LLM_RATE_LIMIT_WINDOW_SECONDS", "60"))
    USAGE.day = _utc_day_key()
    USAGE.tokens = 0
    empty!(REQUEST_LOG)
    return nothing
end

# Reset the daily token counter when the UTC day rolls over. Call only inside LOCK.
function _rollover!()
    today = _utc_day_key()
    if USAGE.day != today
        USAGE.day = today
        USAGE.tokens = 0
    end
    return nothing
end

"""
    check_request() -> RateLimitResult

Pre-flight gate, called **before** issuing an LLM request. Enforces, in order:

1. The daily token budget — once `LLM_DAILY_TOKEN_BUDGET` tokens have been consumed in
   the current UTC day, further requests are rejected until the next day.
2. A global sliding-window request rate — at most `LLM_RATE_LIMIT_REQUESTS` requests
   per `LLM_RATE_LIMIT_WINDOW_SECONDS` across all traffic.

When the request is admitted, its timestamp is recorded so it counts toward the
window. Thread-safe.
"""
function check_request()
    lock(LOCK) do
        _rollover!()

        # (1) Daily token budget
        if USAGE.tokens >= CONFIG.daily_token_budget
            return RateLimitResult(false, 429,
                "The daily AI usage limit has been reached. Please try again tomorrow.")
        end

        # (2) Sliding-window request rate
        cutoff = time() - CONFIG.rate_limit_window
        filter!(t -> t >= cutoff, REQUEST_LOG)
        if length(REQUEST_LOG) >= CONFIG.rate_limit_requests
            return RateLimitResult(false, 429,
                "Too many requests. Please wait a moment and try again.")
        end

        push!(REQUEST_LOG, time())
        return RateLimitResult(true, 200, "")
    end
end

"""
    record_usage(total_tokens::Integer)

Add the tokens consumed by a completed LLM call to the current day's counter. Call
this **after** a successful response. A non-positive count is a no-op (e.g. when the
LLM response carried no usage data). Thread-safe.
"""
function record_usage(total_tokens::Integer)
    total_tokens <= 0 && return nothing
    lock(LOCK) do
        _rollover!()
        USAGE.tokens += total_tokens
    end
    return nothing
end

"""
    usage_status() -> NamedTuple

Return the current daily token usage as `(day, tokens, budget, remaining)`. Thread-safe.
"""
function usage_status()
    lock(LOCK) do
        _rollover!()
        return (
            day = USAGE.day,
            tokens = USAGE.tokens,
            budget = CONFIG.daily_token_budget,
            remaining = max(0, CONFIG.daily_token_budget - USAGE.tokens),
        )
    end
end

end # module
