module EndpointHandler

using Genie

using Dates
using JuMP
using DataFrames
using LinearAlgebra
using Distributions

using DataLoader
using PatientAllocation
using HospitalDecisionOptimization
import PatientAllocationResults

export handle_patients_request
export handle_decision_optimization
export generate_report
export get_all_data


function handle_patients_request(
		scenario::Symbol,
		patient_type::Symbol,
		objective::Symbol,
		constrain_integer::Bool,
		transfer_budget_dict::Dict{String,Any},
		surge_preferences_dict::Dict{String,Any},
		capacity_util::Float64,
		uncertainty_level::Symbol,
		los_param::String,

		start_date::Date,
		end_date::Date,
	)
	@info "Handle Patients Request"
	@info "Scenario: $(scenario), Patient type: $(patient_type)"

	@assert patient_type in [:acute, :icu, :total]

	data = load_jhhs(scenario, patient_type, start_date, end_date)
	default_capacity_level = 1

	if los_param == "default_dist"
		los_dist = los_dist_default(patient_type)
	elseif !isnothing(tryparse(Int, los_param))
		los_dist = tryparse(Int, los_param)
	else
		error("Invalid los distribution selection: $(los_param)")
	end

	if patient_type == :ward
		transfer_budget_dict["bcc"] = "0"
		surge_preferences_dict["bcc"] = "1.0"
	end

	transfer_budget_total = parse(Int, transfer_budget_dict["total"])
	transfer_budget_byday = haskey(transfer_budget_dict, "byday") ? parse(Int, transfer_budget_dict["byday"]) : -1
	transfer_budget = [parse(Int, transfer_budget_dict[lowercase(k)]) for k in data.node_names]
	surge_preferences = [parse(Float64, surge_preferences_dict[lowercase(k)]) for k in data.node_names]

	N, C = size(data.capacity)

	if objective == :none
		N, T = size(data.admitted)
		sent = zeros(Float64, N, N, T)
	elseif objective == :minoverflow
		objective_weights = ones(Float64, N, C)
		objective_weights[:,end] = 1.0 .- (0.003 * surge_preferences)

		model = patient_redistribution(
			data.capacity,
			data.initial,
			data.discharged,
			data.admitted,
			data.adj,
			los_dist,
			sent_penalty=0.01,
			smoothness_penalty=0.001,
			active_smoothness_penalty=0.01,
			admitted_smoothness_penalty=0.25,
			capacity_cushion=(1.0-capacity_util),
			objective_weights=objective_weights,
			transfer_budget=transfer_budget_total,
			transfer_budget_byday=transfer_budget_byday,
			transfer_budget_bynode=transfer_budget,
			constrain_integer=constrain_integer,
			verbose=false,
		)
		sent = value.(model[:sent])
	elseif objective == :loadbalance
		model = patient_loadbalance(
			data.capacity[:,default_capacity_level],
			data.initial,
			data.discharged,
			data.admitted,
			data.adj,
			los_dist,
			sent_penalty=0.01,
			smoothness_penalty=0.001,
			active_smoothness_penalty=0.01,
			admitted_smoothness_penalty=0.25,
			capacity_cushion=(1.0-capacity_util),
			transfer_budget=transfer_budget_total,
			transfer_budget_byday=transfer_budget_byday,
			transfer_budget_bynode=transfer_budget,
			constrain_integer=constrain_integer,
			verbose=false,
		)
		sent = value.(model[:sent])
	elseif objective == :hybrid
		node_weights = 1.0 .- (0.003 * surge_preferences)
		capacity_weights = ones(Int, C)
		capacity_weights[end] = 4
		overflowmin_weight = 0.5
		loadbalance_weight = 2.0

		model = patient_hybridmodel(
			data.capacity,
			data.initial,
			data.discharged,
			data.admitted,
			data.adj,
			los_dist,
			overflowmin_weight=overflowmin_weight,
			loadbalance_weight=loadbalance_weight,
			sent_penalty=5.0,
			smoothness_penalty=0,
			active_smoothness_penalty=0.01,
			admitted_smoothness_penalty=0.25,
			capacity_cushion=(1.0-capacity_util),
			node_weights=node_weights,
			capacity_weights=capacity_weights,
			transfer_budget=transfer_budget_total,
			transfer_budget_byday=transfer_budget_byday,
			transfer_budget_bynode=transfer_budget,
			constrain_integer=constrain_integer,
			verbose=false,
		)
		sent = value.(model[:sent])
	else
		error("Invalid objective: $(objective)")
	end

	results = PatientAllocationResults.results_all(
		sent,
		data.capacity[:,default_capacity_level],
		data.initial,
		data.discharged,
		data.admitted,
		data.node_names,
		start_date,
		los_dist,
		use_rounding=false,
	)

	sims = PatientAllocationResults.admission_sims(patient_type)

	config = Dict(
		:start_date => data.start_date,
		:end_date   => data.end_date,
		:dates      => collect(data.start_date : Day(1) : data.end_date),
		:node_names => data.node_names,
		:node_names_abbrev => data.node_names_abbrev,
		:node_locations    => data.node_locations,
		:capacity_names => data.capacity_names,
		:node_type => "hospital",
		:region    => data.region,
		:extent    => data.extent,
		:capacity_util => capacity_util,
		:default_capacity_level => default_capacity_level,
	)

	outcomes = Dict(
		:summary => results.summary_table,
		:full_results => results.complete_table,
		:sent_matrix => results.sent_matrix_table,
		:net_sent => results.netsent,
		:sent => permutedims(sent, (3,2,1)),
		:beds => data.beds,
		:capacity => permutedims(data.capacity, (2,1)),
		:active => permutedims(results.active_patients, (2,1)),
		:active_null => permutedims(results.active_patients_nosent, (2,1)),
		:admitted => permutedims(data.admitted, (2,1)),
		:admission_sims => sims,
		:total_patients => sum(data.initial) + sum(data.admitted),
		:config => config,
	)
	return outcomes
end

function handle_decision_optimization(
		start_date::Date,
		end_date::Date,

		patient_type::String,
		bed_type::String,

		forecast_scenario::String,

		decision_targets::Array{String,1},
		capacity_type::String,
		constrain_integer::Bool,

		transferbudget_dict::Dict{String,Any},
		objective_weights_dict::Dict{String,Any},
		capacity_util::Float64,
	)
	@info "Optimize hospital decisions"
	@info "Dates: $start_date to $end_date"

	forecast_scenario = "none"

	data = load_jhhs_full(forecast_scenario, patient_type, bed_type)

	s = findfirst(==(start_date), data.dates)
	t = findfirst(==(end_date), data.dates)
	Topt = collect(s:t)

	N = size(data.arrivals, 1)
	T = length(Topt)

	data = merge(
		data, (;
			capacity_levels = data.capacity_levels .* capacity_util,
			capacity_perlevel = data.capacity_perlevel .* capacity_util,
		)
	)

	capacitycosts = [parse(Float64, objective_weights_dict[lowercase(h)])*2 + 0.05 for h in data.node_names]

	transferbudget = TransferBudgets(
		N, T,
		total = parse(Int, transferbudget_dict["total"]),
		perday = tryparse(Int, get(transferbudget_dict, "byday", "")),
		perhospitalday = [parse(Int, transferbudget_dict[lowercase(k)]) for k in data.node_names],
	)

	model_params = ModelParams(decision_targets, capacity_type)
	obj_params = ObjectiveParams(N, T, transfercosts=2, capacitycosts=capacitycosts)
	solver_params = SolverParams(integer=constrain_integer)

	model = optimize_decisions(
		data.arrivals,
		data.capacity_perlevel,
		data.los_dists,
		Topt,
		transferbudget,
		model_params,
		obj_params,
		solver_params,
	)
	decisions = unpack_decisions(model)

	arrivals = data.arrivals[:,Topt]
	admissions = decisions.admissions

	occupancy_notfr = data.occupancy[:,Topt]
	occupancy = decisions.occupancy

	equilibrium_admissions = data.capacity_levels ./ mean(data.los_dists[1])

	fmt(arr) = permutedims(arr, reverse(1:ndims(arr)))
	config = Dict(
		:dates => data.dates[Topt],
		:node_names => data.node_names,
		:node_locations => data.node_locations,
		:capacity_names => data.capacity_names,
		:region => data.region,
	)
	outcomes = Dict(
		:transfers => fmt(decisions.transfers),

		:capacity => fmt(decisions.capacity),
		:capacity_level => fmt(decisions.capacity_level),
		:capacity_perlevel => fmt(data.capacity_perlevel),

		:admissions => fmt(admissions),
		:arrivals => fmt(arrivals),

		:occupancy => fmt(occupancy),
		:occupancy_notfr => fmt(occupancy_notfr),

		:config => config,
	)
	return outcomes
end

function generate_report()
	scenario = :moderate
	objective = :minoverflow
	constrain_integer = false
	surge_preferences_dict = Dict{String,Any}("bmc" => "0", "hcgh" => "0", "jhh" => "0", "sh" => "0", "smh" => "0")
	capacity_util = 0.95
	uncertainty_level = :default
	los_param = "default_dist"
	# start_date = today()
	# end_date = today() + Month(1)
	start_date = Date(2021, 12, 15)
	end_date = Date(2022, 2, 15)

	responses = Dict()
	for patient_type in [:icu, :acute]
		tfr_budget = (patient_type == :icu) ? "15" : "25"
		transfer_budget_dict = Dict{String,Any}(h => tfr_budget for h in ["bmc", "hcgh", "jhh", "sh", "smh", "total"])
		r = handle_patients_request(
			scenario,
			patient_type,
			objective,
			constrain_integer,
			transfer_budget_dict,
			surge_preferences_dict,
			capacity_util,
			uncertainty_level,
			los_param,
			start_date,
			end_date,
		)
		r[:transfer_budget] = tfr_budget
		responses[patient_type] = r
	end

	for patient_type in [:icu, :acute]
		sims = PatientAllocationResults.admission_sims(patient_type)
		responses[patient_type][:admission_sims] = sims
	end

	responses[:meta] = (;
		scenario,
		objective,
		constrain_integer,
		capacity_util,
		start_date,
		end_date,
	)

	return responses
end

function get_all_data(patienttype, scenario)
	return load_completedata(patienttype, scenario)
end

end;
