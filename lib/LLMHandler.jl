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

## What This Dashboard Does

The dashboard runs **mathematical optimization models** on real hospital data to produce **recommendations** (not actions — no transfers or changes are made automatically). It recommends:
- **Patient transfers** between hospitals to balance load and minimize the need for surge capacity
- **Capacity levels** (how many beds to staff/open) at each hospital over time
- **Occupancy projections** showing how patient counts evolve with and without the recommended transfers

There are two model variants available on different pages:
- **Patient Allocation** (simplified model): Optimizes patient transfers given fixed capacity levels. Faster to run, good for exploring transfer strategies.
- **Decision Optimization** (full model): Jointly optimizes both transfers and capacity level decisions. More comprehensive but slower.

## Key Concepts

- **Capacity levels**: Each hospital has multiple defined capacity levels (e.g., "Baseline", "Surge 1", "Surge 2"). Each level represents a specific number of beds that can be staffed. Higher levels require more resources (staff, equipment, space) and should only be activated when necessary.
- **Surge capacity**: Additional beds beyond baseline capacity that a hospital activates in emergencies. The number of surge beds needed = max(0, peak_occupancy − baseline_capacity). If surge is needed even with transfers, the system needs more capacity.
- **Load**: Occupancy divided by capacity. A load of 1.0 (100%) means the hospital is exactly at capacity. Above 1.0 means overflow/surge is needed.
- **Transfer budget**: The maximum number of patient transfers allowed per day, configurable per-hospital and system-wide. This is a constraint on the optimization.
- **Capacity utilization**: What percentage of total beds can practically be used (e.g., 90% accounts for staffing gaps, equipment, infection control). Lower utilization = more conservative planning.
- **Length of stay (LOS)**: How long patients stay once admitted. Longer stays mean occupancy builds up faster relative to admissions.
- **Forecast scenario**: Whether future admissions assume no change (None), an optimistic decline, or a moderate increase.
- **Optimization objective**: What the model prioritizes — minimizing surge capacity, balancing load across hospitals, a hybrid of both, or no transfers at all.

## How to Interpret Results

When the context below includes results data, use the specific numbers provided to give precise, data-grounded answers. Key things to check:
1. **System-level**: Is the system as a whole over capacity? (peak system load > 1.0 or 100%). If so, no amount of transfers can avoid surge everywhere — new capacity is needed.
2. **Per-hospital stress**: Which hospitals have the highest peak loads? Which need the most surge beds? These are the bottleneck facilities.
3. **Transfer effectiveness**: Compare metrics with vs. without transfers. How much does the surge requirement drop? Which hospitals benefit most from receiving/sending patients?
4. **Transfer routes**: The largest transfer routes show the model's main strategy. Transfers typically flow from over-capacity hospitals to those with headroom.
5. **Peak timing**: When does peak demand occur? If peaks are staggered across hospitals, transfers can be very effective. If simultaneous, less so.
6. **Admission trends**: Rising admissions drive future occupancy. If admissions are accelerating, the situation will worsen.

## Dashboard Sections & Plots

The results are displayed across several dashboard sections. When users ask about specific topics, you can refer them to the most relevant section:

1. **Occupancy Timeline** — Multi-panel chart (one per hospital) showing daily patient occupancy. Dark line = with transfers, faint line = without. Horizontal lines show capacity thresholds. Best for: seeing individual hospital trajectories and when/where capacity is exceeded.

2. **Capacity Timeline** — Shows the recommended capacity levels for each hospital over time as color-coded bands or stepped lines. Best for: understanding when to activate or deactivate additional capacity.

3. **Recommended Transfers** — Sankey diagram showing total transfer volumes between hospitals, plus a breakdown plot showing daily transfer counts over time. Best for: understanding which hospitals send/receive patients and the largest transfer routes.

4. **Metrics** — Summary statistics tables including total transfers, surge capacity needed (with/without transfers), percent reduction, and per-hospital surge requirements with max required capacity level. Also includes admission targets showing sustainable admission rates per capacity level. Best for: quick numeric overview and comparing scenarios.

5. **Admissions** — Multi-panel timeline of daily patient admissions per hospital. Admissions are the input driver — they determine future occupancy based on length of stay. Best for: understanding demand patterns and identifying admission surges.

6. **Required Surge Capacity Map** — Geographic maps showing hospital locations with color-coded capacity status (green = within capacity, red = over capacity) and transfer arrows. Side-by-side comparison of without/with transfers. Best for: geographic perspective on which areas are stressed and transfer feasibility.

7. **System Load** — Total system occupancy vs. total system capacity over time. When the occupancy line exceeds the capacity line, the system as a whole cannot accommodate all patients. Best for: overall system-level assessment.

8. **Hospital Loads** — Per-hospital occupancy normalized by capacity (load ratio), shown side-by-side for without/with transfers. The red line at 100% marks the capacity threshold. Best for: comparing relative stress across hospitals and seeing transfer impact.

## Response Guidelines

- Use the specific numbers from the results data in your answers. Don't just describe general trends — give exact values (e.g., "JHH peaks at 142 patients on Jan 15, exceeding its 120-bed baseline capacity by 22 beds").
- When a user asks "what is happening at hospital X", check the per-hospital stats for that hospital and reference specific numbers.
- Reference the dashboard sections by name when directing users to relevant visualizations (e.g., "You can see this in the **Hospital Loads** section").
- All transfers shown are **recommendations from the optimization model**, not actions that have been taken. Use language like "the model recommends" or "the optimization suggests".
- Use full markdown formatting — the response is rendered with marked.js.
- Be concise but thorough. Prioritize actionable insights.
- Don't ask follow-up questions.
"""

const FIGURE_PROMPTS = Dict(
    "results-dashboard" => """
The user is viewing the **Occupancy Timeline** section. This shows a multi-panel chart with one panel per hospital displaying daily patient occupancy (number of patients) over the selected time period.

How to read this chart:
- Each panel represents one hospital in the system
- The x-axis is the date, the y-axis is the number of patients (occupancy)
- A **dark line** shows occupancy WITH the recommended transfers applied
- A **faint line** shows occupancy WITHOUT transfers (what would happen with no intervention)
- **Horizontal lines** show capacity thresholds at different levels (e.g., baseline capacity, surge levels). Lower thresholds are shown in yellow/orange, higher ones in red.
- When occupancy exceeds a capacity line, that hospital needs to activate that capacity level or higher

Use the per-hospital stats in the context data to cite exact peak and median occupancy values. Refer users to the **Hospital Loads** section to see the same data normalized as a percentage of capacity, or the **System Load** section for the aggregate view.
""",

    "results-capacity" => """
The user is viewing the **Capacity Timeline** section. This shows the recommended capacity levels for each hospital over time.

How to read this chart:
- Each panel or line represents a hospital
- The x-axis is the date, the y-axis shows capacity (number of beds)
- Color-coded bands or stepped lines represent different capacity levels (e.g., Baseline, Surge 1, Surge 2)
- The chart shows when and where the model recommends activating additional capacity

Key things to explain:
- Which hospitals need to ramp up capacity and when — look at the required capacity levels from the context data
- Whether capacity increases are temporary (during peak) or sustained
- Lead time: the model may recommend activating surge capacity *before* peak occupancy arrives
- Cross-reference with the **Occupancy Timeline** to show how capacity recommendations align with projected patient counts
""",

    "results-transfers" => """
The user is viewing the **Recommended Transfers** section. There are two plots here:
1. **Sankey diagram**: Ribbons connect sending hospitals (left) to receiving hospitals (right). Ribbon width is proportional to total transfer volume over the time period.
2. **Breakdown plot**: Shows daily transfer counts over time, broken down by hospital pair, so users can see when transfers happen and how they vary.

Use the transfer data from the context (total transfers, per-hospital sent/received, transfer routes) to give specific numbers. The transfer routes show which hospital pairs dominate. Explain *why* the model recommends these routes — typically, senders are hospitals that exceed capacity while receivers have headroom.

Key things to highlight:
- Net senders vs. net receivers and the volumes involved
- The largest routes (cite them by name and patient count)
- Whether transfers are concentrated during a peak period or spread across the timeline
- Whether the transfer budget is binding (if total transfers are close to budget × days, the model may want to transfer more but is constrained)
""",

    "results-metrics" => """
The user is viewing the **Metrics** section. This section contains several tables:

1. **Summary metrics table**: Shows system-wide statistics:
   - Required surge capacity with and without transfers (total patient-days of overflow above baseline capacity)
   - Max required surge capacity with and without transfers (peak simultaneous overflow beds)
   - Total transferred patients and percent of patients transferred
   - Reduction in required surge capacity from transfers

2. **Surge capacity per-hospital table**: For each hospital shows:
   - Required surge capacity (extra beds beyond baseline) with and without transfers
   - Maximum required capacity level (e.g., Baseline, Surge 1, Surge 2)

3. **Admission targets table**: Shows the sustainable daily admission rate for each hospital at each capacity level. If current average admissions exceed the target for a capacity level, that level is insufficient (highlighted red). This helps administrators understand admission thresholds.

Use the numeric data from the context to explain these metrics. Emphasize the *reduction* in surge needs that transfers provide, and flag any hospitals that still need surge capacity even with transfers.
""",

    "results-admdis" => """
The user is viewing the **Admissions** section. This shows daily patient admissions for each hospital over the time period as a multi-panel timeline (one panel per hospital).

How to read this chart:
- The x-axis is the date, the y-axis is the number of new patients admitted per day
- Each panel shows one hospital

Admissions are the **input driver** of the model — they determine future occupancy based on the length of stay parameter. A spike in admissions leads to a rise in occupancy several days later, persisting for the duration of the average length of stay.

Use the admission stats from the context (peak daily, mean daily, total) to give specific numbers. Key things to discuss:
- Whether admissions are rising, falling, or steady — this indicates where the situation is heading
- Hospitals with the highest admission rates relative to their capacity
- The relationship between admission timing and the occupancy peaks seen in other sections
- Refer users to the **Metrics** section's admission targets table to understand sustainable admission rates
""",

    "results-maps" => """
The user is viewing the **Required Surge Capacity Map** section. Two geographic maps are shown side by side:
- **Left map**: Capacity status WITHOUT transfers (baseline scenario)
- **Right map**: Capacity status WITH the recommended transfers applied

How to read:
- Each hospital is shown as a colored circle on the map at its geographic location
- **Green** = within capacity (no surge needed), **Red** = over capacity (darker red = more surge needed)
- **Arrows** between hospitals show recommended patient transfers, with arrow width proportional to transfer volume

Key things to explain:
- The geographic pattern of stress — are overloaded hospitals clustered in one area?
- How the map changes from left to right — which hospitals flip from red to green thanks to transfers?
- Whether transfers involve long distances (logistical feasibility)
- Refer users to the **Recommended Transfers** section for exact numbers and the **Hospital Loads** section for time-series detail
""",

    "results-totalload" => """
The user is viewing the **System Load** section. This shows the total aggregate patient load across ALL hospitals compared to total system capacity.

How to read:
- The x-axis is the date, the y-axis shows occupancy as a percentage of total system capacity
- The curve shows total system occupancy over time (without transfers, since transfers don't change system totals)
- The **red line at 100%** marks total system capacity
- The **green zone** (below 100%) means the system theoretically has enough beds
- The **red zone** (above 100%) means the system as a whole is over capacity — no amount of transfers can avoid surge somewhere

This is a critical chart for understanding the fundamental constraint: **transfers can redistribute patients but cannot create new beds**. If system load exceeds 100%, surge capacity is unavoidable. Use the system stats from the context to cite the exact peak and median system load values.

Refer users to the **Hospital Loads** section to see how individual hospitals compare, and the **Occupancy Timeline** for absolute patient counts.
""",

    "results-load" => """
The user is viewing the **Hospital Loads** section. This shows the load (occupancy ÷ capacity) for each individual hospital as a line over time.

How to read:
- Two side-by-side panels: **Without Transfers** (left) and **With Transfers** (right)
- Each colored line represents one hospital
- The y-axis shows load as a percentage of baseline capacity (100% = at capacity)
- The **red line at 100%** marks the capacity threshold
- **Green zone** (below 100%) = within capacity, **Red zone** (above 100%) = overflow / surge needed
- The legend at the bottom identifies which color corresponds to which hospital

Key analysis points using the context data:
- Which hospitals are above 100% without transfers? (cite their peak load values)
- After transfers, which hospitals drop below 100%? Which remain above?
- How evenly is load distributed? Ideally, with transfers, all hospitals should be at similar load levels
- If all hospitals are simultaneously at high load, transfers have limited benefit — they can only redistribute, not reduce total demand
""",
)

"""
    format_context(context::Dict) -> String

Format the dynamic context from the frontend into a comprehensive string for the LLM,
including model parameters, per-hospital statistics, system-wide metrics, and transfer details.
"""
function format_context(context)
    sections = String[]

    # ── Model Parameters ──
    params = String[]
    if haskey(context, "start_date") && haskey(context, "end_date")
        push!(params, "- Date range: $(context["start_date"]) to $(context["end_date"])")
    end
    if haskey(context, "num_days")
        push!(params, "- Number of days modeled: $(context["num_days"])")
    end
    if haskey(context, "patient_type")
        push!(params, "- Patient type: $(context["patient_type"])")
    end
    if haskey(context, "objective")
        push!(params, "- Optimization objective: $(context["objective"])")
    end
    if haskey(context, "scenario")
        push!(params, "- Forecast scenario: $(context["scenario"])")
    end
    if haskey(context, "capacity_utilization")
        push!(params, "- Capacity utilization: $(context["capacity_utilization"])%")
    end
    if haskey(context, "length_of_stay")
        push!(params, "- Length of stay: $(context["length_of_stay"])")
    end
    if haskey(context, "transfer_budget_total")
        push!(params, "- Transfer budget (system-wide per day): $(context["transfer_budget_total"])")
    end
    if haskey(context, "transfer_budgets_per_hospital")
        budgets = context["transfer_budgets_per_hospital"]
        if budgets isa AbstractDict
            strs = ["  - $k: $v/day" for (k, v) in budgets]
            push!(params, "- Transfer budgets per hospital:\n" * join(strs, "\n"))
        end
    end
    if haskey(context, "region")
        push!(params, "- Region: $(context["region"])")
    end
    if haskey(context, "page")
        page_desc = context["page"] == "patients" ? "Patient Allocation (simplified model)" : "Decision Optimization (full model)"
        push!(params, "- Dashboard page: $page_desc")
    end
    if !isempty(params)
        push!(sections, "## Model Parameters\n" * join(params, "\n"))
    end

    # ── Hospitals & Capacity ──
    hospitals = get(context, "hospitals", nothing)
    if hospitals isa AbstractVector && !isempty(hospitals)
        push!(sections, "## Hospitals in System\n$(join(hospitals, ", "))")
    end

    if haskey(context, "capacity_level_names")
        cap_names = context["capacity_level_names"]
        if cap_names isa AbstractVector
            push!(sections, "## Capacity Levels Available\nFrom lowest to highest: $(join(cap_names, " < "))")
        end
    end

    if haskey(context, "hospital_capacity")
        hcap = context["hospital_capacity"]
        if hcap isa AbstractDict
            lines = String[]
            for (hosp, levels) in hcap
                if levels isa AbstractDict
                    level_strs = ["$ln: $lv beds" for (ln, lv) in levels]
                    push!(lines, "- **$hosp**: $(join(level_strs, ", "))")
                end
            end
            push!(sections, "## Hospital Capacity (beds per level)\n" * join(lines, "\n"))
        end
    end

    # ── System-Wide Statistics ──
    if haskey(context, "system_stats")
        ss = context["system_stats"]
        if ss isa AbstractDict
            lines = String[]
            _push_stat!(lines, ss, "total_baseline_capacity", "Total baseline capacity")
            _push_stat!(lines, ss, "peak_occupancy_without_transfers", "Peak system occupancy (without transfers)")
            _push_stat!(lines, ss, "peak_occupancy_with_transfers", "Peak system occupancy (with transfers)")
            _push_stat!(lines, ss, "median_occupancy_without_transfers", "Median system occupancy (without transfers)")
            _push_stat!(lines, ss, "median_occupancy_with_transfers", "Median system occupancy (with transfers)")
            _push_pct!(lines, ss, "peak_load_without_transfers", "Peak system load (without transfers)")
            _push_pct!(lines, ss, "peak_load_with_transfers", "Peak system load (with transfers)")
            _push_stat!(lines, ss, "system_surge_needed_without_transfers", "System surge beds needed (without transfers)")
            _push_stat!(lines, ss, "system_surge_needed_with_transfers", "System surge beds needed (with transfers)")
            _push_stat!(lines, ss, "peak_date_without_transfers", "Peak date (without transfers)")
            _push_stat!(lines, ss, "peak_date_with_transfers", "Peak date (with transfers)")
            push!(sections, "## System-Wide Statistics\n" * join(lines, "\n"))
        end
    end

    # ── Transfers Summary ──
    tfr_lines = String[]
    if haskey(context, "total_transfers")
        push!(tfr_lines, "- Total recommended transfers: $(context["total_transfers"])")
    end
    if haskey(context, "total_patients")
        total = context["total_patients"]
        push!(tfr_lines, "- Total patients in system: $total")
        if haskey(context, "total_transfers")
            pct = round(context["total_transfers"] / total * 100; digits=1)
            push!(tfr_lines, "- Percent of patients transferred: $pct%")
        end
    end
    if haskey(context, "transfers_sent")
        sent = context["transfers_sent"]
        if sent isa AbstractDict
            strs = ["  - $k: $v" for (k, v) in sent]
            push!(tfr_lines, "- Patients sent per hospital:\n" * join(strs, "\n"))
        end
    end
    if haskey(context, "transfers_received")
        recv = context["transfers_received"]
        if recv isa AbstractDict
            strs = ["  - $k: $v" for (k, v) in recv]
            push!(tfr_lines, "- Patients received per hospital:\n" * join(strs, "\n"))
        end
    end
    if haskey(context, "transfer_routes")
        routes = context["transfer_routes"]
        if routes isa AbstractDict && !isempty(routes)
            sorted = sort(collect(routes); by=last, rev=true)
            strs = ["  - $k: $v patients" for (k, v) in sorted]
            push!(tfr_lines, "- Transfer routes (largest first):\n" * join(strs, "\n"))
        end
    end
    if !isempty(tfr_lines)
        push!(sections, "## Transfer Summary\n" * join(tfr_lines, "\n"))
    end

    # ── Per-Hospital Statistics ──
    if haskey(context, "hospital_stats")
        hs = context["hospital_stats"]
        if hs isa AbstractDict
            lines = String[]
            for (hosp, stats) in hs
                if stats isa AbstractDict
                    s = String[]
                    _push_stat!(s, stats, "baseline_capacity", "Baseline capacity")
                    _push_stat!(s, stats, "peak_occupancy_without_transfers", "Peak occupancy (no transfers)")
                    _push_stat!(s, stats, "peak_occupancy_with_transfers", "Peak occupancy (with transfers)")
                    _push_stat!(s, stats, "median_occupancy_without_transfers", "Median occupancy (no transfers)")
                    _push_stat!(s, stats, "median_occupancy_with_transfers", "Median occupancy (with transfers)")
                    _push_pct!(s, stats, "peak_load_without_transfers", "Peak load (no transfers)")
                    _push_pct!(s, stats, "peak_load_with_transfers", "Peak load (with transfers)")
                    _push_stat!(s, stats, "surge_needed_without_transfers", "Surge beds needed (no transfers)")
                    _push_stat!(s, stats, "surge_needed_with_transfers", "Surge beds needed (with transfers)")
                    push!(lines, "### $hosp\n" * join(s, "\n"))
                end
            end
            push!(sections, "## Per-Hospital Statistics\n" * join(lines, "\n\n"))
        end
    end

    # ── Required Capacity Levels ──
    if haskey(context, "required_capacity_levels")
        rcl = context["required_capacity_levels"]
        if rcl isa AbstractDict
            strs = ["- $k: $v" for (k, v) in rcl]
            push!(sections, "## Required Capacity Level (with transfers)\n" * join(strs, "\n"))
        end
    end

    # ── Admission Statistics ──
    if haskey(context, "admission_stats")
        as = context["admission_stats"]
        if as isa AbstractDict
            lines = String[]
            for (hosp, stats) in as
                if stats isa AbstractDict
                    s = String[]
                    _push_stat!(s, stats, "total_admissions", "Total admissions")
                    _push_stat!(s, stats, "peak_daily_admissions", "Peak daily admissions")
                    _push_stat!(s, stats, "mean_daily_admissions", "Mean daily admissions")
                    push!(lines, "- **$hosp**: $(join(s, "; "))")
                end
            end
            push!(sections, "## Admission Statistics\n" * join(lines, "\n"))
        end
    end

    if isempty(sections)
        return ""
    end

    return "\n\n# Current Results Data\n\n" * join(sections, "\n\n")
end

# Helper to push a stat line if key exists
function _push_stat!(lines, d, key, label)
    if haskey(d, key)
        push!(lines, "- $label: $(d[key])")
    end
end

# Helper to push a percentage stat (load values are ratios, display as %)
function _push_pct!(lines, d, key, label)
    if haskey(d, key)
        val = d[key]
        pct = isa(val, Number) ? "$(round(val * 100; digits=0))%" : "$val"
        push!(lines, "- $label: $pct")
    end
end

"""
    handle_chat_request(messages, context, figure_id, image_data) -> Dict

Process a chat request by assembling the prompt layers and calling the LLM
via the responses API.

Returns a Dict with keys:
- `"reasoning"`: Concatenated reasoning summary text (may be empty)
- `"response"`: The assistant's answer text

- `messages`: Array of message dicts with "role" and "content" keys
- `context`: Dict of current dashboard parameters and key results (can be empty)
- `figure_id`: Optional section identifier for figure-specific prompts (can be nothing/empty)
- `image_data`: Optional base64 PNG data URL for figure image (can be nothing/empty)
"""
function handle_chat_request(messages, context, figure_id, image_data)
    # Build system instructions
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

    # Build input messages for the responses API
    api_messages = Vector{Dict{String,Any}}()

    for (i, msg) in enumerate(messages)
        role = get(msg, "role", "user")
        content = get(msg, "content", "")

        # Attach image to the last user message if provided
        if i == length(messages) && role == "user" && image_data !== nothing && !isempty(string(image_data))
            img_url = string(image_data)
            push!(api_messages, Dict{String,Any}(
                "role" => "user",
                "content" => [
                    Dict{String,Any}("type" => "input_text", "text" => string(content)),
                    Dict{String,Any}("type" => "input_image", "image_url" => img_url),
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

    @show system_text
    @show api_messages

    # Call the LLM using the responses API
    response = OpenAI.openai_request(
        "responses", provider;
        method = "POST",
        http_kwargs = (; readtimeout = 180),
        input = api_messages,
        model = LLM_MODEL,
        instructions = system_text,
        reasoning = Dict("effort" => "low", "summary" => "detailed"),
        store = true,
    )

    @show response

    # Extract reasoning summaries and answer from the response
    output = response.response["output"]

    reasoning_parts = String[]
    answer_parts = String[]
    for item in output
        if item["type"] == "reasoning"
            for summary in item["summary"]
                if summary["type"] == "summary_text"
                    push!(reasoning_parts, summary["text"])
                end
            end
        elseif item["type"] == "message"
            for content_item in item["content"]
                if content_item["type"] == "output_text"
                    push!(answer_parts, content_item["text"])
                end
            end
        end
    end

    return Dict(
        "reasoning" => join(reasoning_parts, "\n\n"),
        "response" => join(answer_parts, ""),
    )
end

end # module
