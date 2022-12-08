module HospitalDecisionOptimization

using JuMP
using Gurobi
using MathOptInterface
using LinearAlgebra

using Distributions


export optimize_decisions
export unpack_decisions
export TransferBudgets, ModelParams, ObjectiveParams, SolverParams


struct TransferBudgets
	perhospitalday::Array{Real,2}
	perhospitalpair::Array{Real,2}
	perday::Array{Real,1}
	perhospital::Array{Real,1}
	total::Real
end

struct ModelParams
	optimize_capacity::Bool
	optimize_transfers::Bool
	capacity_type::Symbol
end

struct ObjectiveParams
	transfercosts::Array{Real,2}
	capacitycosts::Array{Real,1}

	transfer_smoothness::Real
	capacity_smoothness::Real
	occupancy_smoothness::Real
	admissions_smoothness::Real
end

struct SolverParams
	integer::Bool
	timelimit::Real
	verbose::Bool
end


function optimize_decisions(
		arrivals::Array{<:Real,2},
		capacity_perlevel::Array{<:Real,2},
		los::Array{<:Distribution,1},
		Topt::Array{Int,1},
		transferbudget::TransferBudgets,
		model_params::ModelParams,
		obj_params::ObjectiveParams,
		solver_params::SolverParams;
		adj_matrix=nothing,
	)

	N, T = size(arrivals)
	C = size(capacity_perlevel, 2)

	L = discretize_los(los, T)

	# create model
	model = Model(Gurobi.Optimizer)
	if !solver_params.verbose set_silent(model) end

	# set model parameters
	model[:N] = N
	model[:C] = C
	model[:Topt] = Topt

	# decision variables
	@variable(model, transfers[1:N, 1:N, Topt] ≥ 0, integer=solver_params.integer)
	@variable(model, capacity_level[1:N, Topt, 1:C] ≥ 0, Bin)

	@expression(model, transfers_[i=1:N, j=1:N, t=1:T], (t ∈ Topt) ? transfers[i,j,t] : 0)

	# occupancy
	@expression(model, admissions[i=1:N, t=1:T], arrivals[i,t] + sum(transfers_[:,i,t]) - sum(transfers_[i,:,t]))
	@expression(model, discharges[i=1:N, t=1:T], dot(admissions[i,1:t], L[i,t:-1:1]))
	@expression(model, occupancy[i=1:N, t=1:T], sum(admissions[i,1:t]) - sum(discharges[i,1:t]))

	# capacity
	@expression(model, capacity[i=1:N, t=Topt], sum(capacity_level[i,t,c] * capacity_perlevel[i,c] for c in 1:C))

	@constraint(model, [i=1:N, t in Topt], capacity[i,t] ≥ occupancy[i,t])
	@constraint(model, [i=1:N, t in Topt, c=1:C-1], capacity_level[i,t,c] ≥ capacity_level[i,t,c+1])

	# transfer constraint
	@constraint(model, [i=1:N, t in Topt], sum(transfers[i,:,t]) ≤ arrivals[i,t])

	# transfer budgets
	add_transfer_budget!(model, transferbudget)

	# objective
	objective = compute_objective(model, obj_params)
	@objective(model, Min, objective)

	# solve
	optimize!(model)

	return model
end

function discretize_los(los::Array{<:Distribution,1}, T::Int)
	L = [pdf(l, t) for l in los, t in 0:T]
	return L
end

function compute_objective(model, costs)
	objective = @expression(model, AffExpr(0))

	Topt = model[:Topt]
	transfers = model[:transfers].data
	capacity = model[:capacity].data

	if any(costs.transfercosts .!= 0)
		add_to_expression!(objective, dot(costs.transfercosts, sum(transfers, dims=3)))
	end

	if any(costs.capacitycosts .!= 0)
		add_to_expression!(objective, dot(costs.capacitycosts, sum(capacity, dims=2)))
	end

	return objective
end

function add_transfer_budget!(model, transferbudget)
	N = model[:N]
	Topt = model[:Topt]
	transfers = model[:transfers]

	notinf(x) = !isinf(x)
	if any(notinf.(transferbudget.perhospitalpair))
		@constraint(model, [i=1:N, j=1:N, t in Topt], transfers[i,j,t] ≤ transferbudget.perhospitalpair[i,j])
	end
	if any(notinf.(transferbudget.perhospital))
		@constraint(model, [i=1:N, t in Topt], sum(transfers[i,:,t]) ≤ transferbudget.perhospital[i])
	end
	if notinf(transferbudget.total)
		@constraint(model, [i=1:N, j=1:N, t in Topt], sum(transfers) ≤ transferbudget.total)
	end

	return model
end

function unpack_decisions(model)
	Topt = model[:Topt]
	return (;
		transfers = Array(value.(model[:transfers])),
		capacity_level = sum(Array(value.(model[:capacity_level])), dims=3)[:,:],
		capacity = Array(value.(model[:capacity])),
		admissions = value.(model[:admissions])[:,Topt],
		occupancy = value.(model[:occupancy])[:,Topt],
	)
end

function TransferBudgets(N, T; perhospitalday=nothing, perhospitalpair=nothing, perday=nothing, perhospital=nothing, total=nothing)
	perhospitalday = isnothing(perhospitalday) ? fill(Inf, (N, T)) : (ndims(perhospitalday) == 1) ? repeat(perhospitalday, 1, T) : perhospitalday
	perhospitalpair = isnothing(perhospitalpair) ? fill(Inf, (N, N)) : perhospitalpair
	perday = isnothing(perday) ? fill(Inf, T) : (perday isa Array) ? perday : fill(perday, T)
	perhospital = isnothing(perhospital) ? fill(Inf, N) : perhospital
	total = isnothing(total) ? Inf : total
	return TransferBudgets(perhospitalday, perhospitalpair, perday, perhospital, total)
end

function ModelParams(decision_types::Array{String,1}, capacity_type::String)
	return ModelParams(
		"capacity" in decision_types,
		"transfers" in decision_types,
		Symbol(capacity_type),
	)
end

function ObjectiveParams(N, T; transfercosts=nothing, capacitycosts=nothing, transfer_smoothness=nothing, capacity_smoothness=nothing, occupancy_smoothness=nothing, admissions_smoothness=nothing)
	transfercosts = isnothing(transfercosts) ? fill(0, (N, N)) : (transfercosts isa Array) ? transfercosts : fill(transfercosts, (N, N))
	capacitycosts = isnothing(capacitycosts) ? fill(0, N) : (capacitycosts isa Array) ? capacitycosts : fill(capacitycosts, N)
	transfer_smoothness = isnothing(transfer_smoothness) ? 0 : transfer_smoothness
	capacity_smoothness = isnothing(capacity_smoothness) ? 0 : capacity_smoothness
	occupancy_smoothness = isnothing(occupancy_smoothness) ? 0 : occupancy_smoothness
	admissions_smoothness = isnothing(admissions_smoothness) ? 0 : admissions_smoothness
	return ObjectiveParams(transfercosts, capacitycosts, transfer_smoothness, capacity_smoothness, occupancy_smoothness, admissions_smoothness)
end

function SolverParams(;integer=nothing, timelimit=nothing, verbose=nothing)
	integer = isnothing(integer) ? false : integer
	timelimit = isnothing(timelimit) ? Inf : timelimit
	verbose = isnothing(verbose) ? false : verbose
	return SolverParams(integer, timelimit, verbose)
end

end