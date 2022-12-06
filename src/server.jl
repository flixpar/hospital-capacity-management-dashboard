using Genie
using Genie.Router
using Genie.Requests

using JSON
using Dates

push!(LOAD_PATH, normpath(@__DIR__, "..", "src"));
push!(LOAD_PATH, normpath(@__DIR__, "..", "lib"));

using EndpointHandler


route("/") do
	serve_static_file("html/data.html")
end

route("/patients") do
	serve_static_file("html/patients.html")
end

route("/recommendations") do
	serve_static_file("html/recommendations.html")
end

route("/data") do
	serve_static_file("html/data.html")
end

route("/report") do
	serve_static_file("html/report.html")
end

route("/method") do
	serve_static_file("html/method.html")
end

route("/about") do
	serve_static_file("html/about.html")
end

route("/api/patients", method=POST) do
	str_to_symbol(s) = Symbol(replace(lowercase(s), " " => "_"))

	input = jsonpayload()

	scenario = str_to_symbol(input["scenario"])
	patient_type = str_to_symbol(input["patient_type"])
	objective = str_to_symbol(input["objective"])
	transfer_budget = Dict(input["transferbudget"])
	surge_preferences = Dict(input["surgepreferences"])
	capacity_util = parse(Float64, input["utilization"])
	uncertainty_level = str_to_symbol(input["uncertaintylevel"])
	los = input["los"]
	constrain_integer = (input["integer"] == "true")

	start_date = Date(input["start_date"])
	end_date   = Date(input["end_date"])

	response = handle_patients_request(
		scenario, patient_type,
		objective, constrain_integer,
		transfer_budget, surge_preferences,
		capacity_util, uncertainty_level, los,
		start_date, end_date,
	)
	return json(response)
end

route("/api/recommendations", method=POST) do
	input = jsonpayload()

	start_date = Date(input["start_date"])
	end_date   = Date(input["end_date"])

	patient_type = input["patient_type"]
	bed_type = input["bed_type"]
	forecast_scenario = "none" # input["forecast_scenario"]

	decision_targets = (input["objective"] == "capacity+transfers") ? ["transfers", "capacity"] : [input["objective"]]
	capacity_type = input["capacity_type"]
	constrain_integer = (input["integer"] == "true")

	transfer_budget = Dict(input["transferbudget"])
	objective_weights = Dict(input["surgepreferences"])

	capacity_util = parse(Float64, input["utilization"])

	uncertainty_level = input["uncertaintylevel"]
	los = input["los"]

	response = handle_decision_optimization(
		start_date, end_date,
		patient_type, bed_type,
		forecast_scenario,

		decision_targets,
		capacity_type,
		constrain_integer,

		transfer_budget, objective_weights,
		capacity_util,
	)
	return json(response)
end

route("/api/report", method=GET) do
	response = generate_report()
	return json(response)
end

route("/api/data", method=GET) do
	paramsdata = getpayload()
	patienttype = get(paramsdata, :patienttype, "icu")
	scenario = get(paramsdata, :scenario, "none")
	response = get_all_data(patienttype, scenario)
	return json(response)
end

if abspath(PROGRAM_FILE) == @__FILE__
	port = (haskey(ENV, "PORT") ? parse(Int, ENV["PORT"]) : 8000)
	up(port, async = false)
end
