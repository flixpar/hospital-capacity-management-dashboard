include("forecast_shortterm.jl")
include("format_shortterm.jl")
include("format_longterm.jl")
include("format_realdata.jl")
include("package_rawdata.jl")
include("package_complete.jl")


function update_all_data()
	println("Formatting raw data")
	format_data()
	println("Formatting long-term forecast")
	format_longterm()
	println("Forecasting occupancy")
	forecast_shortterm_occupancy()
	println("Forecasting admissions")
	forecast_shortterm_admissions()
	println("Formatting short-term forecast")
	format_shortterm()
	println("Packaging raw data")
	package_data_raw()
	println("Packaging complete data")
	package_data_complete()
	return
end

if abspath(PROGRAM_FILE) == @__FILE__
	update_all_data()
end
