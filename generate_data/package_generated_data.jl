using CSV
using DataFrames
using Dates
using Serialization

using Distributions
using Convex
using Gurobi


function estimate_admitted(active::Array{<:Real,1}, los_dist::Distribution; l::Int=35)
	T = length(active)
	L = 1.0 .- cdf.(los_dist, 0:l)

	admitted = Convex.Variable(T+l)
	est_active = [L' * admitted[(t+l):-1:t] for t in 1:T]
	cons = [admitted[t] >= 0 for t in 1:(T+l)]
	problem = minimize(sum(square.(est_active - active)), cons)

	solve!(problem, Gurobi.Optimizer, silent_solver=true)
	sol_admitted = evaluate(admitted)

	return sol_admitted[(l+1):end]
end

function estimate_admitted(active::Array{<:Real,2}, los_dist::Distribution)
	admitted = Array{Float64,2}(undef, size(active)...)
	for i in 1:size(active,1)
		admitted[i,:] = estimate_admitted(active[i,:], los_dist)
	end
	return admitted
end

function package_los()
    los_dist = Dict(
        :icu => Gamma(1.77595, 5.9512),
        :acute => Gamma(2.601, 3.8046),
        :combined => Gamma(2.244, 4.4988),
    )
    return los_dist
end

function package_shortterm()
    bedtypes = [:combined, :icu, :acute, :combined_flagged]
    scenarios = [:none, :moderate]
    nodata = (;active=Float64[], admitted=Float64[])
    pkg = Dict{Any,NamedTuple}((b,s) => nodata for b in bedtypes, s in scenarios)
    pkg[:meta] = (;hospitals=String[], date_range=Date[], available=false)
    return pkg
end

function package_longterm()
    bedtypes = [:combined, :icu, :acute, :combined_flagged]
    scenarios = [:none, :moderate]
    nodata = (;active=Float64[], admitted=Float64[])
    pkg = Dict{Any,NamedTuple}((b,s) => nodata for b in bedtypes, s in scenarios)
    pkg[:meta] = (;hospitals=String[], date_range=Date[], available=false)
    return pkg
end

function package_capacity_from_generated(hospitals::Vector{String}, data::DataFrame)
    # Get hospital capacities and peak occupancy for each hospital
    hospital_stats = combine(groupby(data, :hospital_id), 
        :bed_capacity => first => :bed_capacity,
        :daily_occupancy => maximum => :peak_occupancy
    )
    
    levels = ["Baseline", "Ramp-Up", "Surge", "Surge+", "Max", "Crisis"]
    icu_ratio = 0.25
    
    pkg = Dict()
    combined_capacity = zeros(Int, length(hospitals), length(levels))
    
    for (i, hospital) in enumerate(hospitals)
        hospital_row = filter(row -> row.hospital_id == hospital, hospital_stats)[1, :]
        base_capacity = hospital_row.bed_capacity
        peak_census = hospital_row.peak_occupancy
        
        # Design capacity levels based on actual surge patterns
        # Ensure some levels are crossed during peaks, but max capacity remains above peak
        
        # Baseline: Set to handle typical non-surge occupancy (75-85% of base)
        baseline_cap = round(Int, base_capacity * rand(0.75:0.01:0.85))
        
        # Calculate what percentage the peak represents of base capacity
        peak_ratio = peak_census / base_capacity
        
        # Design intermediate levels to be crossed during surges
        # Some hospitals should exceed certain thresholds, others shouldn't
        surge_start_ratio = rand(0.95:0.01:1.05)  # When surge response begins - bigger gap from baseline
        surge_plus_ratio = rand(1.05:0.01:1.25) # Enhanced surge capacity
        
        # Ensure at least one intermediate level is crossed by making it lower than peak
        # But vary this across hospitals for realism
        if rand() < 0.7  # 70% of hospitals will cross surge threshold
            surge_ratio = peak_ratio * rand(0.85:0.01:0.95)  # Just below peak
        else
            surge_ratio = peak_ratio * rand(1.05:0.01:1.15)  # Above peak
        end
        
        # Maximum capacity should always be above peak with reasonable buffer
        max_ratio = max(peak_ratio * rand(1.2:0.01:1.4), surge_plus_ratio * 1.1)
        crisis_ratio = max_ratio * rand(1.1:0.01:1.2)
        
        # Calculate actual capacity levels
        capacities = [
            baseline_cap,  # Baseline
            round(Int, base_capacity * surge_start_ratio),  # Ramp-Up
            round(Int, base_capacity * surge_ratio),        # Surge
            round(Int, base_capacity * surge_plus_ratio),   # Surge+
            round(Int, base_capacity * max_ratio),          # Max
            round(Int, base_capacity * crisis_ratio)        # Crisis
        ]
        
        # Ensure monotonic increase and minimum differences
        for j in 2:length(capacities)
            capacities[j] = max(capacities[j], capacities[j-1] + 5)
        end
        
        combined_capacity[i, :] = capacities
    end
    
    pkg[:combined] = combined_capacity
    
    # ICU capacity with surge-based logic similar to combined capacity
    icu_capacity = zeros(Int, size(combined_capacity))
    for i in 1:size(combined_capacity, 1)
        hospital_row = filter(row -> row.hospital_id == hospitals[i], hospital_stats)[1, :]
        peak_combined = hospital_row.peak_occupancy
        peak_icu = round(Int, icu_ratio * peak_combined)  # Estimated peak ICU census
        base_icu = round(Int, combined_capacity[i, 1] * icu_ratio)  # Baseline ICU capacity
        
        # Design ICU capacity levels based on actual ICU surge patterns
        # ICU typically has more constrained surge capacity than general beds
        
        # Baseline ICU capacity (same as base calculation)
        icu_baseline = base_icu
        
        # Calculate ICU peak ratio relative to baseline ICU capacity
        icu_peak_ratio = peak_icu / base_icu
        
        # Design ICU surge levels - more conservative than combined bed surge
        icu_ramp_ratio = rand(1.05:0.01:1.15)      # Ramp-up with bigger gap from baseline
        icu_surge_plus_ratio = rand(1.1:0.01:1.3)  # More limited surge expansion
        
        # Ensure some ICU levels are crossed but with smaller margins than combined
        if rand() < 0.8  # 80% of hospitals will cross ICU surge threshold
            icu_surge_ratio = icu_peak_ratio * rand(0.88:0.01:0.96)  # Closer to peak
        else
            icu_surge_ratio = icu_peak_ratio * rand(1.02:0.01:1.1)   # Above peak
        end
        
        # Maximum ICU capacity should be above peak with adequate buffer
        # ICU needs higher buffer due to criticality of these beds
        icu_max_ratio = max(icu_peak_ratio * rand(1.3:0.01:1.5), icu_surge_plus_ratio * 1.15)
        icu_crisis_ratio = icu_max_ratio * rand(1.1:0.01:1.25)
        
        # Calculate ICU capacity levels
        icu_capacities = [
            icu_baseline,                                    # Baseline
            round(Int, base_icu * icu_ramp_ratio),          # Ramp-Up
            round(Int, base_icu * icu_surge_ratio),         # Surge
            round(Int, base_icu * icu_surge_plus_ratio),    # Surge+
            round(Int, base_icu * icu_max_ratio),           # Max
            round(Int, base_icu * icu_crisis_ratio)         # Crisis
        ]
        
        # Ensure monotonic increase and minimum differences
        for j in 2:length(icu_capacities)
            icu_capacities[j] = max(icu_capacities[j], icu_capacities[j-1] + 2)
        end
        
        icu_capacity[i, :] = icu_capacities
    end
    pkg[:icu] = icu_capacity
    
    # Acute capacity = combined - ICU
    pkg[:acute] = combined_capacity - icu_capacity
    
    pkg[:meta] = (;hospitals, capacity_names=levels)
    
    return pkg
end


function package_realdata_from_generated(los_dist)
    data = DataFrame(CSV.File("outputs/covid_hospital_data.csv"))

    hospitals = String.(sort(unique(data.hospital_id)))
    date_range = sort(unique(data.date))
    n_hospitals = length(hospitals)
    n_dates = length(date_range)

    d_dict = Dict((row.hospital_id, row.date) => row for row in eachrow(data))

    active_combined = [haskey(d_dict, (h,t)) ? d_dict[(h,t)].daily_occupancy : 0 for h in hospitals, t in date_range]
    admitted_combined = [haskey(d_dict, (h,t)) ? d_dict[(h,t)].daily_admissions : 0 for h in hospitals, t in date_range]

    icu_ratio = 0.25
    active_icu = round.(Int, icu_ratio .* active_combined)
    active_acute = active_combined - active_icu

    println("Estimating ICU admissions from occupancy data...")
    admitted_icu = estimate_admitted(active_icu, los_dist[:icu])
    println("Estimating Acute admissions from occupancy data...")
    admitted_acute = estimate_admitted(active_acute, los_dist[:acute])
    
    active_combined_flagged = zeros(Int, n_hospitals, n_dates)
    
    pkg = Dict()
    pkg[:combined] = (active=active_combined, admitted=admitted_combined)
    pkg[:icu] = (active=active_icu, admitted=admitted_icu)
    pkg[:acute] = (active=active_acute, admitted=admitted_acute)
    pkg[:combined_flagged] = (active=active_combined_flagged,)
    pkg[:meta] = (;hospitals, date_range)

    return pkg, data
end

function create_hospital_system_metadata(hospitals::Vector{String}, raw_data::DataFrame)
    # Create default hospital colors using a color palette
    colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f"]
    
    # Get unique hospital data
    hospital_info = combine(groupby(raw_data, :hospital_id), 
        :hospital_name => first => :hospital_name,
        :hospital_type => first => :hospital_type
    )
    
    # Generate synthetic coordinates in a regional cluster
    # Center around a default location (roughly mid-Atlantic region)
    center_lat, center_long = 39.0, -76.6
    lat_range, long_range = 0.5, 0.8
    
    hospital_details = Dict()
    for (i, hospital) in enumerate(hospitals)
        hospital_subset = filter(row -> row.hospital_id == hospital, hospital_info)
        hospital_row = hospital_subset[1, :]
        
        # Generate coordinates within regional bounds
        lat = center_lat + (rand() - 0.5) * lat_range
        lng = center_long + (rand() - 0.5) * long_range
        
        hospital_details[hospital] = (
            id = hospital,
            name = hospital_row.hospital_name,
            short_name = hospital,
            type = hospital_row.hospital_type,
            lat = lat,
            long = lng,
            color = colors[(i-1) % length(colors) + 1]
        )
    end
    
    # Create hospital system metadata
    system_metadata = (
        region_type = "hospital_system",
        region_name = "SHS",  # Synthetic Hospital System
        region_fullname = "Synthetic Hospital System",
        region_description = "Generated synthetic hospital system for capacity management demonstration",
        hospitals = hospital_details,
        hospital_count = length(hospitals),
        extent = (extent_type = :points, extent_regions = [])
    )
    
    return system_metadata
end

"""
Main function to package generated data.
"""
function package_generated_data()
    mkpath("../data/")
    
    println("Packaging generated data...")

    los_dist = package_los()
    
    realdata_pkg, raw_data = package_realdata_from_generated(los_dist)
    
    hospitals = realdata_pkg[:meta].hospitals
    capacity_pkg = package_capacity_from_generated(hospitals, raw_data)
    
    # Create hospital system metadata
    system_metadata = create_hospital_system_metadata(hospitals, raw_data)

    outdata = (
        realdata  = realdata_pkg,
        shortterm = package_shortterm(),
        longterm  = package_longterm(),
        capacity  = capacity_pkg,
        los       = los_dist,
        system_metadata = system_metadata,
    )

    output_path = "../data/data.jlser"
    serialize(output_path, outdata)

    println("Packaging complete.")
    println("Generated data package saved to $(output_path)")
    println("Hospital system: $(system_metadata.region_fullname)")
    println("Hospital count: $(system_metadata.hospital_count)")

    return
end

if abspath(PROGRAM_FILE) == @__FILE__
	package_generated_data()
end 