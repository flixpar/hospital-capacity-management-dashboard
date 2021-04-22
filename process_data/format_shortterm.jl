using CSV
using DataFrames
using Dates

include("util.jl")


function format_shortterm()

	forecast_date = string(latest_shortterm())

	admissions_total = DataFrame(CSV.File("../rawdata/shortterm/$(forecast_date)/admissions-total.csv"))
	if "index" in names(admissions_total) select!(admissions_total, Not(:index)) end
	if "Column1" in names(admissions_total) rename!(admissions_total, :Column1 => :date) end
	admissions_total = stack(admissions_total, Not(:date))
	rename!(admissions_total, :variable => :hospital, :value => :admissions_total)
	# admissions_total.date = map(d -> Date(d, "m/d/y")+Year(2000), admissions_total.date)
	sort!(admissions_total, [:hospital, :date])

	occupancy_icu = DataFrame(CSV.File("../rawdata/shortterm/$(forecast_date)/occupancy-icu.csv"))
	if "index" in names(occupancy_icu) select!(occupancy_icu, Not(:index)) end
	occupancy_icu = stack(occupancy_icu, Not(:date))
	rename!(occupancy_icu, :variable => :hospital, :value => :occupancy_icu)
	# occupancy_icu.date = map(d -> Date(d, "m/d/y")+Year(2000), occupancy_icu.date)
	sort!(occupancy_icu, [:hospital, :date])

	occupancy_acute = DataFrame(CSV.File("../rawdata/shortterm/$(forecast_date)/occupancy-acute.csv"))
	if "index" in names(occupancy_acute) select!(occupancy_acute, Not(:index)) end
	occupancy_acute = stack(occupancy_acute, Not(:date))
	rename!(occupancy_acute, :variable => :hospital, :value => :occupancy_acute)
	# occupancy_acute.date = map(d -> Date(d, "m/d/y")+Year(2000), occupancy_acute.date)
	sort!(occupancy_acute, [:hospital, :date])

	forecast_data = outerjoin(occupancy_acute, occupancy_icu, admissions_total, on=[:hospital, :date])
	insertcols!(forecast_data, 5, :occupancy_total => forecast_data.occupancy_acute + forecast_data.occupancy_icu)

	filter!(row -> row.hospital != "system", forecast_data)
	dropmissing!(forecast_data)

	forecast_data |> CSV.write("../data/shortterm-$(forecast_date).csv")

	return
end
