using CSV
using DataFrames
using Dates
using Serialization

using Distributions
using Convex
using Gurobi

include("util.jl")


function package_data_complete()

	function package_realdata()
		data_date = replace(string(latest_data()), "-" => "_")
		realdata = DataFrame(CSV.File("../data/realdata/jhhs_realdata_$(data_date).csv"))

		hospitals = String.(sort(unique(realdata.hospital)))
		date_range = sort(unique(realdata.date))

		d_dict = Dict((row.hospital, row.date) => row for row in eachrow(realdata))

		active_combined         = [haskey(d_dict, (h,t)) ? d_dict[(h,t)].occupancy_combined         : 0 for h in hospitals, t in date_range]
		active_combined_flagged = [haskey(d_dict, (h,t)) ? d_dict[(h,t)].occupancy_combined_flagged : 0 for h in hospitals, t in date_range]
		active_icu              = [haskey(d_dict, (h,t)) ? d_dict[(h,t)].occupancy_icu           : 0 for h in hospitals, t in date_range]
		active_acute            = [haskey(d_dict, (h,t)) ? d_dict[(h,t)].occupancy_acute         : 0 for h in hospitals, t in date_range]
		admitted_combined       = [haskey(d_dict, (h,t)) ? d_dict[(h,t)].admissions_combined     : 0 for h in hospitals, t in date_range]

		los_dist = package_los()
		admitted_icu = estimate_admitted(active_icu, los_dist[:icu])
		admitted_acute = estimate_admitted(active_acute, los_dist[:acute])

		pkg = Dict()
		pkg[:combined] = (active=active_combined, admitted=admitted_combined)
		pkg[:icu] = (active=active_icu, admitted=admitted_icu)
		pkg[:acute] = (active=active_acute, admitted=admitted_acute)
		pkg[:combined_flagged] = (active=active_combined_flagged,)
		pkg[:meta] = (;hospitals, date_range)

		return pkg
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

	function package_los()
		los_dist = Dict(
			:icu => Gamma(1.77595, 5.9512),
			:acute => Gamma(2.601, 3.8046),
			:combined => Gamma(2.244, 4.4988),
		)
		return los_dist
	end

	function package_capacity(patienttype, levels)
		capacity = DataFrame(CSV.File("../data/jhhs_beds.csv"))
		hospitals = String.(sort(unique(capacity.hospital)))
		d_dict = Dict(row.hospital => row for row in eachrow(capacity))
		if patienttype == :icu
			return [d_dict[h]["icu_covid_$l"] for h in hospitals, l in levels]
		elseif patienttype == :acute
			return [d_dict[h]["ward_covid_$l"] for h in hospitals, l in levels]
		elseif patienttype == :combined
			c1 = [d_dict[h]["icu_covid_$l"] for h in hospitals, l in levels]
			c2 = [d_dict[h]["ward_covid_$l"] for h in hospitals, l in levels]
			return c1 + c2
		else
			error("Invalid patienttype: $(patienttype)")
		end
	end

	function package_capacity()
		capacity = DataFrame(CSV.File("../data/jhhs_beds.csv"))
		levels = unique([split(l, "_")[end] for l in setdiff(names(capacity), ["hospital"])])
		hospitals = String.(sort(unique(capacity.hospital)))

		pkg = Dict()
		for pt in [:icu, :acute, :combined]
			pkg[pt] = package_capacity(pt, levels)
		end
		pkg[:meta] = (;hospitals, capacity_names=["Baseline", "Ramp-Up", "Surge", "Surge+", "Max", "Crisis"])

		return pkg
	end

	outdata = (
		realdata  = package_realdata(),
		shortterm = package_shortterm(),
		longterm  = package_longterm(),
		capacity  = package_capacity(),
		los       = package_los(),
	)

	serialize("../data/data.jlser", outdata)

	return
end

function estimate_admitted(active::Array{<:Real,1}, los_dist::Distribution; l::Int=35)
	T = length(active)
	L = 1.0 .- cdf.(los_dist, 0:l)

	admitted = Variable(T+l)
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
