include("format_realdata.jl")
include("package_data.jl")


function update_all()
	println("Formatting raw data")
	format_data()
	println("Packaging complete data")
	package_data_complete()
	return
end

if abspath(PROGRAM_FILE) == @__FILE__
	update_all()
end
