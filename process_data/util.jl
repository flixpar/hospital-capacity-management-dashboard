using Glob
using Dates


function latest_data()
	paths = glob("../rawdata/realdata/realdata_*")
	dates = [Date(replace(splitpath(p)[end][end-9:end], "_" => "-")) for p in paths]
	latest_date = maximum(dates)
	return latest_date
end
