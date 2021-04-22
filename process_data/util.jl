using Glob
using Dates


function latest_shortterm()
	paths = glob("../rawdata/shortterm/*/")
	dates = [Date(splitpath(p)[end]) for p in paths]
	latest_date = maximum(dates)
	return latest_date
end

function latest_longterm()
	paths = glob("../rawdata/forecasts-*")
	dates = [Date(splitpath(p)[end][end-9:end]) for p in paths]
	latest_date = maximum(dates)
	return latest_date
end

function latest_data()
	paths = glob("../rawdata/realdata_*")
	dates = [Date(replace(splitpath(p)[end][end-9:end], "_" => "-")) for p in paths]
	latest_date = maximum(dates)
	return latest_date
end
