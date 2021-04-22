using CSV
using DataFrames
using Dates

include("util.jl")


function format_longterm()

	forecast_date = latest_longterm()

	patienttypes = [:total, :icu, :acute]
	forecasttypes = [:admitted, :active]

	hospitals = ["JHH", "SH", "BMC", "HCGH", "SMH"]
	scenario_abbrevs = Dict(
		"opt"  => "optimistic",
		"mod"  => "moderate",
		"pess" => "pessimistic",
		"cat"  => "catastrophic",
	)

	# load raw forecasts

	active = DataFrame(CSV.File("../rawdata/forecasts-$(forecast_date)/JHMIBedsByDateALL.csv", missingstrings=["", "NA"]))
	active_std = DataFrame(CSV.File("../rawdata/forecasts-$(forecast_date)/JHMIBedsSDByDateALL.csv", missingstrings=["", "NA"]))
	activeicu = DataFrame(CSV.File("../rawdata/forecasts-$(forecast_date)/JHMIBedsICUByDateALL.csv", missingstrings=["", "NA"]))
	activeicu_std = DataFrame(CSV.File("../rawdata/forecasts-$(forecast_date)/JHMIBedsICUSDByDateALL.csv", missingstrings=["", "NA"]))
	admitted = DataFrame(CSV.File("../rawdata/forecasts-$(forecast_date)/JHMIArrByDateALL.csv", missingstrings=["", "NA"]))
	admitted_std = DataFrame(CSV.File("../rawdata/forecasts-$(forecast_date)/JHMIArrSDByDateALL.csv", missingstrings=["", "NA"]))

	# drop index column

	dropcols = ["Column1"]
	select!(active, Not(dropcols))
	select!(active_std, Not(dropcols))
	select!(activeicu, Not(dropcols))
	select!(activeicu_std, Not(dropcols))
	select!(admitted, Not(dropcols))
	select!(admitted_std, Not(dropcols))

	# rename columns

	found_scenarios = (names(active)
		|> xs -> map(n -> split(n, " ")[1], xs)
		|> xs -> filter(n -> n in keys(scenario_abbrevs), xs)
		|> unique
		|> sort)

	rename_dict = Dict(s*" "*h => h*"_"*scenario_abbrevs[s] for s in found_scenarios, h in hospitals)
	rename_dict_std = Dict(s*" "*h => h*"_"*scenario_abbrevs[s]*"_std" for s in found_scenarios, h in hospitals)

	rename!(active, rename_dict)
	rename!(active_std, rename_dict_std)
	rename!(activeicu, rename_dict)
	rename!(activeicu_std, rename_dict_std)
	rename!(admitted, rename_dict)
	rename!(admitted_std, rename_dict_std)

	# join value + std

	active_complete_total = outerjoin(active, active_std, on=:date)
	active_complete_icu = outerjoin(activeicu, activeicu_std, on=:date)
	admitted_complete = outerjoin(admitted, admitted_std, on=:date)

	# fill missing values

	for col in names(active_complete_total)
		if (col == :date) continue end
		active_complete_total[!,col] = coalesce.(active_complete_total[!,col], 0.0)
	end
	for col in names(active_complete_icu)
		if (col == :date) continue end
		active_complete_icu[!,col] = coalesce.(active_complete_icu[!,col], 0.0)
	end
	for col in names(admitted_complete)
		if (col == :date) continue end
		admitted_complete[!,col] = coalesce.(admitted_complete[!,col], 0.0)
	end

	# sort

	sort!(active_complete_total, :date)
	sort!(active_complete_icu, :date)
	sort!(admitted_complete, :date)

	# compute acute occupancy

	active_complete_acute = deepcopy(active_complete_total)
	overlap_dates = intersect(active_complete_total.date, active_complete_icu.date)
	filter!(row -> row.date in overlap_dates, active_complete_acute)
	for col in names(active_complete_acute)
		if (col == "date") continue end
		for d in overlap_dates
			t1 = findfirst(==(d), active_complete_acute.date)
			t2 = findfirst(==(d), active_complete_icu.date)
			active_complete_acute[t1,col] = active_complete_acute[t1,col] - active_complete_icu[t2,col]
		end
	end

	# remove empty rows

	filter!(row -> sum(row[c] for c in setdiff(names(active_complete_total), ["date"])) > 0, active_complete_total)
	filter!(row -> sum(row[c] for c in setdiff(names(active_complete_icu), ["date"])) > 0, active_complete_icu)
	filter!(row -> sum(row[c] for c in setdiff(names(active_complete_acute), ["date"])) > 0, active_complete_acute)
	filter!(row -> sum(row[c] for c in setdiff(names(admitted_complete), ["date"])) > 0, admitted_complete)

	# save intermediate format

	outdir = "../data/forecasts-$(forecast_date)/"
	if !isdir(outdir) mkpath(ourdir) end

	active_complete_total |> CSV.write("../data/forecasts-$(forecast_date)/jhhs_forecast_active_total.csv")
	active_complete_icu |> CSV.write("../data/forecasts-$(forecast_date)/jhhs_forecast_active_icu.csv")
	active_complete_acute |> CSV.write("../data/forecasts-$(forecast_date)/jhhs_forecast_active_acute.csv")
	admitted_complete |> CSV.write("../data/forecasts-$(forecast_date)/jhhs_forecast_admitted_total.csv")

	# convert to long-format

	function load_forecast(forecasttype, patienttype)
		fn = "../data/forecasts-$(forecast_date)/jhhs_forecast_$(forecasttype)_$(patienttype).csv"
		if isfile(fn)
			d = DataFrame(CSV.File(fn))
			d = stack(d, Not(:date))
			d.hospital = map(x -> string(split(x, "_")[1]), d.variable)
			d.scenario = map(x -> string(split(x, "_")[2]), d.variable)
			d.std = map(x -> (count("_", x) == 2) && (split(x, "_")[3] == "std"), d.variable)
			d = unstack(d, [:scenario, :hospital, :date], :std, :value)
			rename!(d, "false" => "$forecasttype", "true" => "$(forecasttype)_std")
			insertcols!(d, 1, :patienttype => fill(string(patienttype), nrow(d)))
			sort!(d, [:scenario, :hospital, :date])
			return d
		else
			return DataFrame("patienttype"=>[], "scenario"=>[], "hospital"=>[], "date"=>[], "$forecasttype"=>[], "$(forecasttype)_std"=>[])
		end
	end

	dfs = DataFrame[]
	for pt in patienttypes
		dfs_ = DataFrame[]
		for ft in forecasttypes
			push!(dfs_, load_forecast(ft, pt))
		end
		df = outerjoin(dfs_..., on=[:scenario, :hospital, :date, :patienttype])
		push!(dfs, df)
	end
	data = vcat(dfs...)

	# filter out reported data

	filter!(row -> row.date >= forecast_date, data)

	# save final output

	data |> CSV.write("../data/longterm-$(forecast_date).csv")

	return
end
