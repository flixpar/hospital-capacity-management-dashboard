module LLMHandler

using OpenAI
using JSON

export handle_chat_request

# Configuration from environment variables
const LLM_BASE_URL = get(ENV, "LLM_BASE_URL", "http://localhost:8111/v1")
const LLM_API_KEY = get(ENV, "LLM_API_KEY", "secret")
const LLM_MODEL = get(ENV, "LLM_MODEL", "Qwen3-VL-8B-Instruct")

const SYSTEM_PROMPT = """
You are an AI assistant embedded in a Hospital Capacity Management Dashboard. This dashboard helps hospital administrators manage patient capacity across a multi-hospital system during periods of high demand (such as COVID-19 surges).

The dashboard runs mathematical optimization models that recommend:
- **Patient transfers** between hospitals to balance load and minimize the need for surge capacity
- **Capacity levels** (how many beds to staff/open) at each hospital over time
- **Occupancy projections** showing how patient counts evolve with and without optimized transfers

When analyzing results, you should:
1. Reference specific hospitals, dates, and values visible in the plots and data
2. Explain what the optimization is recommending and why (e.g., "Hospital X is projected to exceed capacity on date Y, so the model recommends transferring Z patients to Hospital W which has available beds")
3. Highlight key patterns: which hospitals are most stressed, when peak demand occurs, whether transfers are sufficient or surge capacity is still needed
4. Provide actionable insights in plain language suitable for hospital administrators
5. Note any concerning trends or potential issues (e.g., system-wide capacity shortfalls, hospitals consistently near capacity)
6. Be concise but thorough - administrators need quick answers they can act on

Key terminology:
- **Surge capacity**: Additional beds beyond normal capacity that a hospital can activate in emergencies
- **Load balancing**: Distributing patients across hospitals so no single facility is overwhelmed
- **Transfer budget**: Maximum number of patient transfers allowed per day (per hospital or system-wide)
- **Capacity utilization**: Percentage of total beds that can practically be used (accounts for staffing, equipment, etc.)
"""

const FIGURE_PROMPTS = Dict(
    "results-dashboard" => """
The user is viewing the **Occupancy Timeline** (Hospital Dashboard) section. This shows a multi-panel chart with one panel per hospital displaying daily patient occupancy over the selected time period.

How to read this chart:
- Each panel represents one hospital in the system
- The x-axis is the date, the y-axis is the number of patients (occupancy)
- A blue line/area shows occupancy WITHOUT optimized transfers (baseline/historical)
- A green line/area shows occupancy WITH optimized transfers (the recommended scenario)
- A red horizontal line shows the hospital's reported bed capacity
- When the blue line exceeds the red capacity line, that hospital needs surge capacity or transfers

Key patterns to look for:
- Hospitals where blue significantly exceeds red (most stressed facilities)
- How much the green line differs from blue (effectiveness of transfers)
- Whether green stays below red (transfers are sufficient) or still exceeds it (surge capacity needed)
- Timing of peak occupancy across hospitals (simultaneous vs. staggered peaks)
""",

    "results-capacity" => """
The user is viewing the **Capacity Timeline** section. This shows the recommended capacity levels for each hospital over time.

How to read this chart:
- Each panel or line represents a hospital
- The x-axis is the date, the y-axis shows capacity (number of beds)
- Different capacity levels may be shown as stepped lines or colored bands
- The chart shows when and where the model recommends activating additional capacity

Key patterns to look for:
- Which hospitals need to increase capacity and by how much
- When capacity increases are recommended (lead time before peak demand)
- Whether capacity changes are temporary or sustained
- How capacity recommendations align with the occupancy projections
""",

    "results-transfers" => """
The user is viewing the **Recommended Transfers** section. This typically includes a Sankey diagram and/or a breakdown plot showing patient transfers between hospitals.

How to read these charts:
- **Sankey diagram**: Ribbons connect sending hospitals (left) to receiving hospitals (right), with ribbon width proportional to transfer volume
- **Breakdown plot**: Shows daily transfer counts over time, broken down by hospital pair or direction
- Colors typically represent different hospitals or transfer routes

Key patterns to look for:
- Which hospitals are net senders (over capacity) vs. net receivers (have spare capacity)
- The largest transfer routes (thickest ribbons in Sankey)
- How transfers vary over time (concentrated during peak vs. spread out)
- Whether any single hospital receives a disproportionate share of transfers
""",

    "results-metrics" => """
The user is viewing the **Metrics** section. This shows summary statistics and key performance indicators from the optimization results.

Typical metrics include:
- Total number of transfers recommended
- Peak occupancy per hospital (with and without transfers)
- Surge capacity needed (additional beds beyond normal capacity)
- Capacity utilization rates
- System-wide statistics

Focus on:
- Comparing before vs. after optimization metrics
- Highlighting which hospitals benefit most from the optimization
- Quantifying the overall improvement (e.g., "transfers reduce peak surge need by X beds")
- Any hospitals or dates where the optimization cannot fully resolve capacity issues
""",

    "results-admdis" => """
The user is viewing the **Admissions** section. This shows daily patient admissions (and potentially discharges) for each hospital over the time period.

How to read these charts:
- The x-axis is the date, the y-axis is the number of patients admitted per day
- Different lines or bars represent different hospitals
- Admissions drive future occupancy based on length of stay

Key patterns to look for:
- Trends in admission rates (rising, falling, or surging)
- Differences between hospitals in admission volumes
- Correlation between admission spikes and subsequent occupancy peaks
- Whether admissions are the primary driver of capacity stress
""",

    "results-maps" => """
The user is viewing the **Required Surge Capacity Map** section. This shows geographic maps of the hospital system with color-coded capacity status and transfer arrows.

How to read these maps:
- Hospital locations are shown on a geographic map
- Colors indicate capacity status: green means within capacity, red means surge capacity is needed (darker red = more capacity needed)
- Arrows between hospitals show recommended patient transfers, with arrow width proportional to transfer volume
- Typically two maps are shown side by side: historical (without transfers) vs. optimized (with transfers)

Key patterns to look for:
- Geographic clustering of capacity stress
- Whether transfers flow from urban to suburban hospitals or vice versa
- How the color distribution changes between the two maps (effectiveness of transfers)
- Physical distances involved in recommended transfers (feasibility)
""",

    "results-totalload" => """
The user is viewing the **System Load** section. This shows the total patient load across the entire hospital system compared to total system capacity.

How to read this chart:
- The x-axis is the date, the y-axis is the total number of patients across all hospitals
- A blue line shows total system occupancy
- A red line shows total system capacity
- When blue exceeds red, the entire system is beyond capacity and must create new beds

Key patterns to look for:
- Whether the system as a whole has sufficient capacity (blue below red)
- The gap between load and capacity (how much margin exists)
- When peak system load occurs
- Even if system-wide capacity is sufficient, individual hospitals may still be overwhelmed (check per-hospital views)
""",

    "results-load" => """
The user is viewing the **Hospital Loads** section. This shows the load on each individual hospital, comparing scenarios with and without patient transfers.

How to read these charts:
- Typically shown as side-by-side panels: without transfers (left) and with transfers (right)
- Each line represents one hospital's occupancy over time, normalized against its capacity
- The red line at 1.0 (or at the hospital's capacity level) marks the capacity threshold
- Lines above the red line indicate the hospital needs surge capacity

Key patterns to look for:
- Which hospitals exceed capacity without transfers
- Whether transfers bring all hospitals below their capacity lines
- Hospitals that remain above capacity even with transfers (need surge capacity expansion)
- How evenly load is distributed across hospitals after optimization
""",
)

"""
    format_context(context::Dict) -> String

Format the dynamic context from the frontend into a readable string for the LLM.
"""
function format_context(context)
    parts = String[]

    if haskey(context, "start_date") && haskey(context, "end_date")
        push!(parts, "Date range: $(context["start_date"]) to $(context["end_date"])")
    end

    if haskey(context, "patient_type")
        push!(parts, "Patient type: $(context["patient_type"])")
    end

    if haskey(context, "objective")
        push!(parts, "Optimization objective: $(context["objective"])")
    end

    if haskey(context, "hospitals")
        hospitals = context["hospitals"]
        if hospitals isa AbstractVector
            push!(parts, "Hospitals: $(join(hospitals, ", "))")
        end
    end

    if haskey(context, "beds")
        beds = context["beds"]
        if beds isa AbstractDict
            bed_strs = ["$k: $v beds" for (k, v) in beds]
            push!(parts, "Bed capacity: $(join(bed_strs, ", "))")
        end
    end

    if haskey(context, "peak_occupancy")
        peaks = context["peak_occupancy"]
        if peaks isa Dict
            peak_strs = ["$k: $v" for (k, v) in peaks]
            push!(parts, "Peak occupancy: $(join(peak_strs, ", "))")
        end
    end

    if haskey(context, "total_transfers")
        push!(parts, "Total transfers: $(context["total_transfers"])")
    end

    if haskey(context, "capacity_utilization")
        push!(parts, "Capacity utilization: $(context["capacity_utilization"])%")
    end

    if haskey(context, "transfer_budget")
        push!(parts, "Transfer budget: $(context["transfer_budget"])")
    end

    if haskey(context, "scenario")
        push!(parts, "Forecast scenario: $(context["scenario"])")
    end

    if isempty(parts)
        return ""
    end

    return "\n\nCurrent dashboard parameters and results:\n" * join(parts, "\n")
end

"""
    handle_chat_request(messages, context, figure_id, image_data) -> String

Process a chat request by assembling the prompt layers and calling the LLM.

- `messages`: Array of message dicts with "role" and "content" keys
- `context`: Dict of current dashboard parameters and key results (can be empty)
- `figure_id`: Optional section identifier for figure-specific prompts (can be nothing/empty)
- `image_data`: Optional base64 PNG data URL for figure image (can be nothing/empty)
"""
function handle_chat_request(messages, context, figure_id, image_data)
    # Build system message
    system_text = SYSTEM_PROMPT

    # Add dynamic context if provided
    context_str = format_context(context)
    if !isempty(context_str)
        system_text *= context_str
    end

    # Add figure-specific prompt if applicable
    if figure_id !== nothing && !isempty(string(figure_id))
        fig_key = string(figure_id)
        if haskey(FIGURE_PROMPTS, fig_key)
            system_text *= "\n\n" * FIGURE_PROMPTS[fig_key]
        end
    end

    # Build messages array for the API
    api_messages = Vector{Dict{String,Any}}()
    push!(api_messages, Dict{String,Any}("role" => "system", "content" => system_text))

    for (i, msg) in enumerate(messages)
        role = get(msg, "role", "user")
        content = get(msg, "content", "")

        # Attach image to the last user message if provided
        if i == length(messages) && role == "user" && image_data !== nothing && !isempty(string(image_data))
            img_url = string(image_data)
            push!(api_messages, Dict{String,Any}(
                "role" => "user",
                "content" => [
                    Dict{String,Any}("type" => "text", "text" => string(content)),
                    Dict{String,Any}("type" => "image_url", "image_url" => Dict{String,Any}("url" => img_url)),
                ]
            ))
        else
            push!(api_messages, Dict{String,Any}("role" => string(role), "content" => string(content)))
        end
    end

    # Create provider with custom base URL
    provider = OpenAI.OpenAIProvider(
        api_key = LLM_API_KEY,
        base_url = LLM_BASE_URL,
    )

    # Call the LLM
    response = create_chat(
        provider,
        LLM_MODEL,
        api_messages;
    )

    # Extract and return the assistant's response text
    return response.response["choices"][1]["message"]["content"]
end

end # module
