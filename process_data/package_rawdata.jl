using CSV
using DataFrames
using Dates
using Serialization

include("util.jl")


function package_data_raw()

	function package_realdata()
		data_date = replace(string(latest_data()), "-" => "_")
		realdata = DataFrame(CSV.File("../data/jhhs_realdata_$(data_date).csv"))

		hospitals = sort(unique(realdata.hospital))
		date_range = sort(unique(realdata.date))

		d_dict = Dict((row.hospital, row.date) => row for row in eachrow(realdata))

		active_total         = [haskey(d_dict, (h,t)) ? d_dict[(h,t)].active_total         : 0 for h in hospitals, t in date_range]
		active_total_flagged = [haskey(d_dict, (h,t)) ? d_dict[(h,t)].active_total_flagged : 0 for h in hospitals, t in date_range]
		active_icu           = [haskey(d_dict, (h,t)) ? d_dict[(h,t)].active_icu           : 0 for h in hospitals, t in date_range]
		active_acute         = [haskey(d_dict, (h,t)) ? d_dict[(h,t)].active_acute         : 0 for h in hospitals, t in date_range]
		admitted_total       = [haskey(d_dict, (h,t)) ? d_dict[(h,t)].admissions_total     : 0 for h in hospitals, t in date_range]

		pkg = Dict()
		pkg[:total] = (active=active_total, admitted=admitted_total)
		pkg[:icu] = (active=active_icu,)
		pkg[:acute] = (active=active_acute,)
		pkg[:total_flagged] = (active=active_total_flagged,)
		pkg[:meta] = (;hospitals, date_range)

		return pkg
	end

	function package_shortterm()
		data_date = latest_shortterm()
		shortterm = DataFrame(CSV.File("../data/shortterm-$(data_date).csv"))

		hospitals = sort(unique(shortterm.hospital))
		date_range = sort(unique(shortterm.date))

		d_dict = Dict((row.hospital, row.date) => row for row in eachrow(shortterm))

		active_total   = [haskey(d_dict, (h,t)) ? coalesce(d_dict[(h,t)].occupancy_total, NaN)  : NaN for h in hospitals, t in date_range]
		active_icu     = [haskey(d_dict, (h,t)) ? coalesce(d_dict[(h,t)].occupancy_icu, NaN)    : NaN for h in hospitals, t in date_range]
		active_acute   = [haskey(d_dict, (h,t)) ? coalesce(d_dict[(h,t)].occupancy_acute, NaN)  : NaN for h in hospitals, t in date_range]
		admitted_total = [haskey(d_dict, (h,t)) ? coalesce(d_dict[(h,t)].admissions_total, NaN) : NaN for h in hospitals, t in date_range]

		pkg = Dict()
		pkg[:total] = (active=active_total, admitted=admitted_total)
		pkg[:icu] = (active=active_icu,)
		pkg[:acute] = (active=active_acute,)
		pkg[:meta] = (;hospitals, date_range)

		return pkg
	end

	function package_longterm()
		data_date = latest_longterm()
		longterm = DataFrame(CSV.File("../data/longterm-$(data_date).csv"))

		patienttypes = unique(longterm.patienttype)
		scenarios = unique(longterm.scenario)

		hospitals = sort(unique(longterm.hospital))
		date_range = sort(unique(longterm.date))

		pkg = Dict()
		for pt in patienttypes, s in scenarios
			d = filter(r -> r.patienttype == pt && r.scenario == s, longterm)
			d_dict = Dict((row.hospital, row.date) => row for row in eachrow(d))
			active       = [haskey(d_dict, (h,t)) ? coalesce.(d_dict[(h,t)].active, NaN)       : NaN for h in hospitals, t in date_range]
			active_std   = [haskey(d_dict, (h,t)) ? coalesce.(d_dict[(h,t)].active_std, NaN)   : NaN for h in hospitals, t in date_range]
			admitted     = [haskey(d_dict, (h,t)) ? coalesce.(d_dict[(h,t)].admitted, NaN)     : NaN for h in hospitals, t in date_range]
			admitted_std = [haskey(d_dict, (h,t)) ? coalesce.(d_dict[(h,t)].admitted_std, NaN) : NaN for h in hospitals, t in date_range]
			p = all(isnan.(admitted)) ? (;active, active_std) : (;active, active_std, admitted, admitted_std)
			pkg[(Symbol(pt),Symbol(s))] = p
		end

		pkg[:meta] = (;patienttypes, scenarios, hospitals, date_range)

		return pkg
	end

	function package_capacity(patienttype, levels)
		capacity = DataFrame(CSV.File("../data/jhhs_beds.csv"))
		hospitals = sort(unique(capacity.hospital))
		d_dict = Dict(row.hospital => row for row in eachrow(capacity))
		if patienttype == :icu
			return [d_dict[h]["icu_covid_$l"] for h in hospitals, l in levels]
		elseif patienttype == :acute
			return [d_dict[h]["ward_covid_$l"] for h in hospitals, l in levels]
		elseif patienttype == :total
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
		hospitals = sort(unique(capacity.hospital))

		pkg = Dict()
		for pt in [:icu, :acute, :total]
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
	)

	serialize("../data/rawdata.jlser", outdata)

	return
end
